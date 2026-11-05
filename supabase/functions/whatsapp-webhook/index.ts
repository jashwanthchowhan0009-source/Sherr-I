// WhatsApp webhook: Meta sends every incoming message here.
import { think } from "../_shared/brain.ts";
import { type Contact, db, logMessage, type Reminder, type User } from "../_shared/db.ts";
import { base64, type Content, type Part } from "../_shared/gemini.ts";
import { thanksLine, welcomeLine } from "../_shared/i18n.ts";
import { type InboundMessage, normalizePhone, parseInbound, verifyMetaSignature } from "../_shared/util.ts";
import { downloadMedia, sendSmart, sendText } from "../_shared/whatsapp.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
// Optional: comma-separated numbers allowed to use Sherr I (keeps costs safe while testing)
const ALLOWED = (Deno.env.get("ALLOWED_NUMBERS") ?? "")
  .split(",").map((n) => normalizePhone(n)).filter(Boolean) as string[];

const GREETING = /^\s*(hi+|hello|hey|namaste|namaskaram|namaskar|vanakkam|hlo)\b[\s!.🙏]*$/i;
const ACK_WINDOW_MS = 12 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1) Meta webhook verification (one time, when you set the callback URL)
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // 2) Only accept requests really signed by Meta
  const raw = await req.text();
  if (!APP_SECRET) {
    console.error("WHATSAPP_APP_SECRET is not set; refusing webhook");
    return new Response("server not configured", { status: 500 });
  }
  if (!(await verifyMetaSignature(APP_SECRET, raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // 3) Reply 200 fast, process in the background (Meta retries slow webhooks)
  const work = Promise.all(parseInbound(payload).map((m) => handle(m).catch((e) => console.error("handle failed", e))));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;
  return new Response("ok", { status: 200 });
});

async function handle(msg: InboundMessage) {
  const from = msg.from;
  const bodyForLog = msg.text ?? (msg.type === "audio" ? "[voice note]" : `[${msg.type}]`);
  if (!(await logMessage(from, "in", bodyForLog, msg.id))) return; // duplicate delivery

  const nowIso = new Date().toISOString();
  await Promise.all([
    db().from("users").update({ last_inbound_at: nowIso }).eq("phone", from),
    db().from("contacts").update({ last_inbound_at: nowIso }).eq("phone", from),
  ]);

  // Is this person someone's family member?
  const { data: asContact } = await db().from("contacts").select("*, owner:users(*)").eq("phone", from);
  const family = (asContact ?? []) as (Contact & { owner: User })[];

  if (family.length) {
    // a) First message from them => activate
    const pending = family.filter((c) => !c.opted_in);
    if (pending.length) {
      await db().from("contacts").update({ opted_in: true }).in("id", pending.map((c) => c.id));
      const ownerName = pending[0].owner?.name ?? "your family";
      await reply(from, welcomeLine(pending[0].language, ownerName));
      for (const c of pending) {
        await notifyOwner(c.owner, `✅ ${c.name} ne Sherr I activate kar diya! Ab unko reminders jaayenge.`);
      }
      if (msg.text !== undefined && GREETING.test(msg.text)) return;
    }

    // b) Reply to a recent reminder => acknowledge + tell the owner
    const isShort = msg.type === "audio" || (msg.text ?? "").length <= 80;
    if (isShort) {
      const since = new Date(Date.now() - ACK_WINDOW_MS).toISOString();
      const { data: recent } = await db().from("reminders").select("*")
        .in("contact_id", family.map((c) => c.id)).gte("last_sent_at", since)
        .order("last_sent_at", { ascending: false }).limit(5);
      const open = ((recent ?? []) as Reminder[]).find((r) =>
        !r.last_ack_at || new Date(r.last_ack_at) < new Date(r.last_sent_at!)
      );
      if (open) {
        const contact = family.find((c) => c.id === open.contact_id)!;
        await db().from("reminders").update({ last_ack_at: nowIso, last_ack_text: bodyForLog.slice(0, 300) })
          .eq("id", open.id);
        await reply(from, thanksLine(contact.language));
        const said = msg.type === "audio" ? "voice note bheja" : `reply kiya: “${bodyForLog.slice(0, 200)}”`;
        await notifyOwner(contact.owner, `✅ ${contact.name} ne ${said}\n(${open.summary})`);
        return;
      }
    }
  }

  // Otherwise: a normal user talking to Sherr I
  if (ALLOWED.length && !ALLOWED.includes(from)) {
    await reply(from, "Sherr I abhi private beta mein hai 🙏 Jaldi sabke liye open hoga!");
    return;
  }

  let { data: user } = await db().from("users").select("*").eq("phone", from).maybeSingle();
  if (!user) {
    ({ data: user } = await db().from("users")
      .upsert({ phone: from, name: msg.profileName ?? null, last_inbound_at: nowIso }, { onConflict: "phone" })
      .select().single());
  }
  if (!user) {
    await reply(from, "Sorry, abhi thodi dikkat hai. 1 min baad try karo 🙏");
    return;
  }

  const parts: Part[] = [];
  if (msg.type === "audio" && msg.audioId) {
    const bytes = await downloadMedia(msg.audioId);
    if (!bytes) {
      await reply(from, "Voice note download nahi hua 😕 Ek baar phir bhejo?");
      return;
    }
    parts.push({ inlineData: { mimeType: msg.audioMime ?? "audio/ogg", data: base64(bytes) } });
    parts.push({ text: "(The user sent this voice note. Understand it and act on it.)" });
  } else if (msg.text) {
    parts.push({ text: msg.text });
  } else {
    await reply(from, "Abhi main text aur voice notes samajhta hoon 🙂");
    return;
  }

  try {
    const answer = await think(user as User, await loadHistory(from, msg.id), parts);
    await reply(from, answer);
  } catch (e) {
    console.error("brain failed", e);
    await reply(from, "Sorry, abhi thodi dikkat hai. 1 min baad try karo 🙏");
  }
}

async function reply(to: string, text: string) {
  const id = await sendText(to, text);
  await logMessage(to, "out", text, id);
}

async function notifyOwner(owner: User | null | undefined, text: string) {
  if (!owner) return;
  const id = await sendSmart(owner.phone, text, owner.last_inbound_at);
  await logMessage(owner.phone, "out", text, id);
}

/** Last few messages as Gemini history (user turn first, roles merged). */
async function loadHistory(phone: string, excludeWaId: string): Promise<Content[]> {
  const { data } = await db().from("messages").select("direction, body, wa_message_id")
    .eq("phone", phone).order("created_at", { ascending: false }).limit(13);
  const rows = (data ?? []).filter((r) => r.wa_message_id !== excludeWaId).reverse();
  const out: Content[] = [];
  for (const r of rows) {
    const role = r.direction === "in" ? "user" : "model";
    const last = out[out.length - 1];
    if (last?.role === role) last.parts.push({ text: r.body });
    else out.push({ role, parts: [{ text: r.body }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  // history must end with the model so the new user turn alternates cleanly
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}
