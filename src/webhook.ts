// Handles incoming WhatsApp messages.
import { think } from "./brain.ts";
import { contactsByPhone, getOrCreateUser, logMessage, nowIso, type Reminder, type User } from "./db.ts";
import type { Env } from "./env.ts";
import { base64, type Content, type Part } from "./gemini.ts";
import { thanksLine, welcomeLine } from "./i18n.ts";
import { type InboundMessage, normalizePhone, parseInbound, verifyMetaSignature } from "./util.ts";
import { downloadMedia, sendSmart, sendText } from "./whatsapp.ts";

const GREETING = /^\s*(hi+|hello|hey|namaste|namaskaram|namaskar|vanakkam|hlo)\b[\s!.🙏]*$/i;
const ACK_WINDOW_MS = 12 * 60 * 60 * 1000;

export async function handleWebhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);

  // 1) Meta webhook verification (one time, when you set the callback URL)
  if (req.method === "GET") {
    if (
      url.searchParams.get("hub.mode") === "subscribe" && env.WHATSAPP_VERIFY_TOKEN &&
      url.searchParams.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // 2) Only accept requests really signed by Meta
  const raw = await req.text();
  if (!env.WHATSAPP_APP_SECRET) return new Response("server not configured", { status: 500 });
  if (!(await verifyMetaSignature(env.WHATSAPP_APP_SECRET, raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // 3) Reply 200 fast, process in the background (Meta retries slow webhooks)
  for (const m of parseInbound(payload)) {
    ctx.waitUntil(handleMessage(env, m).catch((e) => console.error("handle failed", e)));
  }
  return new Response("ok", { status: 200 });
}

async function handleMessage(env: Env, msg: InboundMessage) {
  const from = msg.from;
  const bodyForLog = msg.text ?? (msg.type === "audio" ? "[voice note]" : `[${msg.type}]`);
  if (!(await logMessage(env, from, "in", bodyForLog, msg.id))) return; // duplicate delivery

  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET last_inbound_at = ? WHERE phone = ?`).bind(now, from),
    env.DB.prepare(`UPDATE contacts SET last_inbound_at = ? WHERE phone = ?`).bind(now, from),
  ]);

  // Is this person someone's family member?
  const family = await contactsByPhone(env, from);
  if (family.length) {
    // a) First message from them => activate
    const pending = family.filter((c) => !c.opted_in);
    if (pending.length) {
      await env.DB.batch(pending.map((c) => env.DB.prepare(`UPDATE contacts SET opted_in = 1 WHERE id = ?`).bind(c.id)));
      await reply(env, from, welcomeLine(pending[0].language, pending[0].owner.name ?? "your family"));
      for (const c of pending) {
        await notifyOwner(env, c.owner, `✅ ${c.name} ne Sherr I activate kar diya! Ab unko reminders jaayenge.`);
      }
      if (msg.text !== undefined && GREETING.test(msg.text)) return;
    }

    // b) Short reply to a recent reminder => acknowledge + tell the owner
    const isShort = msg.type === "audio" || (msg.text ?? "").length <= 80;
    if (isShort) {
      const since = new Date(Date.now() - ACK_WINDOW_MS).toISOString();
      const ids = family.map((c) => c.id);
      const r = await env.DB.prepare(
        `SELECT * FROM reminders WHERE contact_id IN (${ids.map(() => "?").join(",")})
         AND last_sent_at >= ? AND (last_ack_at IS NULL OR last_ack_at < last_sent_at)
         ORDER BY last_sent_at DESC LIMIT 1`,
      ).bind(...ids, since).first<Reminder>();
      if (r) {
        const contact = family.find((c) => c.id === r.contact_id)!;
        await env.DB.prepare(`UPDATE reminders SET last_ack_at = ?, last_ack_text = ? WHERE id = ?`)
          .bind(now, bodyForLog.slice(0, 300), r.id).run();
        await reply(env, from, thanksLine(contact.language));
        const said = msg.type === "audio" ? "voice note bheja" : `reply kiya: “${bodyForLog.slice(0, 200)}”`;
        await notifyOwner(env, contact.owner, `✅ ${contact.name} ne ${said}\n(${r.summary})`);
        return;
      }
    }
  }

  // Otherwise: a normal user talking to Sherr I
  const allowed = (env.ALLOWED_NUMBERS ?? "").split(",").map((n) => normalizePhone(n)).filter(Boolean);
  if (allowed.length && !allowed.includes(from)) {
    await reply(env, from, "Sherr I abhi private beta mein hai 🙏 Jaldi sabke liye open hoga!");
    return;
  }

  const user = await getOrCreateUser(env, from, msg.profileName);

  const parts: Part[] = [];
  if (msg.type === "audio" && msg.audioId) {
    const bytes = await downloadMedia(env, msg.audioId);
    if (!bytes) return await reply(env, from, "Voice note download nahi hua 😕 Ek baar phir bhejo?");
    parts.push({ inlineData: { mimeType: msg.audioMime ?? "audio/ogg", data: base64(bytes) } });
    parts.push({ text: "(The user sent this voice note. Understand it and act on it.)" });
  } else if (msg.text) {
    parts.push({ text: msg.text });
  } else {
    return await reply(env, from, "Abhi main text aur voice notes samajhta hoon 🙂");
  }

  try {
    const answer = await think(env, user, await loadHistory(env, from, msg.id), parts);
    await reply(env, from, answer);
  } catch (e) {
    console.error("brain failed", e);
    await reply(env, from, "Sorry, abhi thodi dikkat hai. 1 min baad try karo 🙏");
  }
}

async function reply(env: Env, to: string, text: string) {
  const id = await sendText(env, to, text);
  await logMessage(env, to, "out", text, id);
}

export async function notifyOwner(env: Env, owner: User, text: string) {
  const id = await sendSmart(env, owner.phone, text, owner.last_inbound_at);
  await logMessage(env, owner.phone, "out", text, id);
}

/** Last few messages as Gemini history (starts with user, ends with model). */
async function loadHistory(env: Env, phone: string, excludeWaId: string): Promise<Content[]> {
  const r = await env.DB.prepare(
    `SELECT direction, body, wa_message_id FROM messages WHERE phone = ? ORDER BY id DESC LIMIT 13`,
  ).bind(phone).all<{ direction: string; body: string; wa_message_id: string | null }>();
  const rows = (r.results ?? []).filter((x) => x.wa_message_id !== excludeWaId).reverse();
  const out: Content[] = [];
  for (const row of rows) {
    const role = row.direction === "in" ? "user" : "model";
    const last = out[out.length - 1];
    if (last?.role === role) last.parts.push({ text: row.body });
    else out.push({ role, parts: [{ text: row.body }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}
