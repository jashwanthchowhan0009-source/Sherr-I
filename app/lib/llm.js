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
/** First non-empty env var among names (trimmed; tolerates stray quotes/spaces from the dashboard). */
function env(...names) {
  for (const n of names) {
    const v = (process.env[n] || "").trim().replace(/^["']|["']$/g, "");
    if (v) return v;
  }
  return "";
}
export const geminiKey = () => env("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_KEY");
export const groqKey = () => env("GROQ_API_KEY", "GROQ_KEY");

// Once the gateway says "no card", stop wasting a round-trip on it for a while.
let gatewayDownUntil = 0;
export const gatewayDown = () => Date.now() < gatewayDownUntil;

function freeLanes() {
  const lanes = [];
  const gk = geminiKey(), qk = groqKey();
  if (gk) {
    const models = (process.env.SHERR_FALLBACK_MODEL || "gemini-3.8-flash,gemini-2.5-flash").split(",").map((m) => m.trim());
    for (const m of models) lanes.push({ url: GEMINI, key: gk, model: m, label: `google/${m}` });
  }
  if (qk) {
    const m = process.env.SHERR_GROQ_MODEL || "openai/gpt-oss-120b";
    lanes.push({ url: GROQ, key: qk, model: m, label: `groq/${m}` });
  }
  return lanes;
}

export async function chat(opts) {
  const { gatewayToken } = opts;
  const lanes = opts.extra?.modalities ? [] : freeLanes(); // images need the gateway
  const useGateway = gatewayToken && !(lanes.length && gatewayDown());
  if (!useGateway && !lanes.length) throw new LLMError("No AI access configured (AI Gateway, GEMINI_API_KEY or GROQ_API_KEY).");
  let lastErr;
  if (useGateway) {
    try {
      return { ...(await call(GATEWAY, gatewayToken, opts)), servedBy: opts.model };
    } catch (e) {
      lastErr = e;
      if (/credit card|40[13]/.test(e.message)) gatewayDownUntil = Date.now() + 15 * 60_000;
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
