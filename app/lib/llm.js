// One OpenAI-compatible client for every model Sherr I uses.
// Primary: Vercel AI Gateway (Claude, GPT, Gemini, image models; no keys on Vercel thanks to OIDC).
// Fallback: Google's own OpenAI-compatible endpoint with a free GEMINI_API_KEY.

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export const MODELS = {
  brain: process.env.SHERR_BRAIN_MODEL || "anthropic/claude-haiku-5.5",
  claude: process.env.SHERR_CLAUDE_MODEL || "anthropic/claude-sonnet-5.5",
  gpt: process.env.SHERR_GPT_MODEL || "openai/gpt-5-mini",
  gemini: process.env.SHERR_GEMINI_MODEL || "google/gemini-3-flash",
  image: process.env.SHERR_IMAGE_MODEL || "google/gemini-3.1-flash-image",
};

export class LLMError extends Error {}

/**
 * @param {object} o
 * @param {string} o.model   gateway id like "anthropic/claude-haiku-5.5"
 * @param {Array}  o.messages
 * @param {Array}  [o.tools]
 * @param {string} [o.gatewayToken]  AI Gateway key or Vercel OIDC token
 * @param {object} [o.extra] extra body fields (e.g. modalities)
 * @param {Function} [o.fetchImpl]
 */
const GROQ = "https://api.groq.com/openai/v1/chat/completions";

/** Free providers tried in order after the gateway (each only if its key is set). */
function freeLanes() {
  const lanes = [];
  if (process.env.GEMINI_API_KEY) {
    const models = (process.env.SHERR_FALLBACK_MODEL || "gemini-3.8-flash,gemini-2.5-flash").split(",").map((m) => m.trim());
    for (const m of models) lanes.push({ url: GEMINI, key: process.env.GEMINI_API_KEY, model: m, label: `google/${m}` });
  }
  if (process.env.GROQ_API_KEY) {
    const m = process.env.SHERR_GROQ_MODEL || "openai/gpt-oss-120b";
    lanes.push({ url: GROQ, key: process.env.GROQ_API_KEY, model: m, label: `groq/${m}` });
  }
  return lanes;
}

export async function chat(opts) {
  const { gatewayToken } = opts;
  const lanes = opts.extra?.modalities ? [] : freeLanes(); // images need the gateway
  if (!gatewayToken && !lanes.length) throw new LLMError("No AI access configured (AI Gateway, GEMINI_API_KEY or GROQ_API_KEY).");
  let lastErr;
  if (gatewayToken) {
    try {
      return { ...(await call(GATEWAY, gatewayToken, opts)), servedBy: opts.model };
    } catch (e) {
      lastErr = e;
      if (!lanes.length) throw e;
      console.warn("gateway failed, using free lanes:", e.message);
    }
  }
  // Free lanes: on rate limit / unknown model, move to the next one
  for (const lane of lanes) {
    try {
      return { ...(await call(lane.url, lane.key, { ...opts, model: lane.model })), servedBy: lane.label };
    } catch (e) {
      lastErr = e;
      console.warn(`lane ${lane.label} failed:`, e.message);
    }
  }
  throw lastErr;
}

async function call(url, token, { model, messages, tools, extra = {}, fetchImpl = fetch, maxTokens = 900 }) {
  const body = { model, messages, max_tokens: maxTokens, ...extra };
  if (tools?.length) body.tools = tools;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || JSON.stringify(json).slice(0, 300);
    throw new LLMError(`${res.status}: ${msg}`);
  }
  const m = json?.choices?.[0]?.message ?? {};
  return {
    content: typeof m.content === "string" ? m.content : "",
    toolCalls: m.tool_calls ?? [],
    images: (m.images ?? []).map((i) => i?.image_url?.url).filter(Boolean),
    raw: m,
  };
}
