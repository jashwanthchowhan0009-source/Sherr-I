// POST /api/chat — the only server endpoint. Keys never reach the phone.
import { respond } from "../lib/agent.js";

const hits = new Map(); // best-effort per-instance rate limit
const LIMIT = 40;
const WINDOW_MS = 10 * 60_000;

function limited(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  h.push(now);
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > LIMIT;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function POST(request) {
  const invites = (process.env.SHERR_INVITE_CODES || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (invites.length) {
    const code = (request.headers.get("x-sherr-invite") || "").trim().toUpperCase();
    if (!invites.includes(code)) return json({ error: "invite_required" }, 401);
  }
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return json({ error: "slow_down", reply: "Thoda ruk ke try karo 🙏" }, 429);

  const len = Number(request.headers.get("content-length") || 0);
  if (len > 200_000) return json({ error: "too_large" }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const gatewayToken = process.env.AI_GATEWAY_API_KEY || request.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN;
  try {
    const out = await respond(body, { gatewayToken });
    return json(out);
  } catch (e) {
    console.error("sherr-i chat failed", e);
    const setup = /credit card|No AI access|401|403/.test(String(e?.message));
    const reply = setup
      ? "Sherr I ka AI abhi connect nahi hai (setup pending). Thodi der mein phir try karo 🙏"
      : "Abhi network mein dikkat hai, ek baar phir bhejo 🙏";
    return json({ reply, actions: [], error: setup ? "ai_setup" : "upstream" }, 502);
  }
}

export function GET() {
  return json({ ok: true, name: "Sherr I", invite: !!process.env.SHERR_INVITE_CODES });
}
