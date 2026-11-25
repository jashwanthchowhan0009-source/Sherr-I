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
export async function chat(opts) {
  const { gatewayToken } = opts;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!gatewayToken && !geminiKey) throw new LLMError("No AI access configured (AI Gateway or GEMINI_API_KEY).");
  if (gatewayToken) {
    try {
      return { ...(await call(GATEWAY, gatewayToken, opts)), servedBy: opts.model };
    } catch (e) {
      // No gateway credits / model blocked: fall back to free Gemini if a key is set
      if (!geminiKey || opts.extra?.modalities) throw e;
      console.warn("gateway failed, falling back to Gemini:", e.message);
    }
  }
  const model = process.env.SHERR_FALLBACK_MODEL || "gemini-2.5-flash";
  return { ...(await call(GEMINI, geminiKey, { ...opts, model })), servedBy: `google/${model}` };
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
