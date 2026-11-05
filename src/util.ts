// Pure helpers (no network, no DB) so they are easy to unit test.

const IST_OFFSET_MIN = 330; // Asia/Kolkata, no DST
const DAY_MS = 24 * 60 * 60 * 1000;
export const SERVICE_WINDOW_MS = DAY_MS;

/** "9876543210" / "+91 98765-43210" / "098765 43210" -> "919876543210". Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

/** ISO string in IST, e.g. 2026-11-05T23:20:00+05:30 */
export function toIstIso(d: Date): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, "+05:30");
}

/** Human readable IST time, e.g. "5 Nov, 11:20 pm" */
export function formatIst(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function weekdayIst(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long" }).format(d);
}

/** For daily reminders: move a time forward in 1-day steps until it is in the future. */
export function rollForwardDaily(next: Date, now: Date): Date {
  if (next.getTime() > now.getTime()) return next;
  const days = Math.floor((now.getTime() - next.getTime()) / DAY_MS) + 1;
  return new Date(next.getTime() + days * DAY_MS);
}

/** WhatsApp lets us send free-form text only within 24h of the person's last message. */
export function isWindowOpen(lastInboundAt: string | Date | null | undefined, now: Date): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  // keep a 5 minute safety margin
  return now.getTime() - t < SERVICE_WINDOW_MS - 5 * 60_000;
}

/** Template params can't contain newlines/tabs or 4+ consecutive spaces, max 1024 chars. */
export function sanitizeTemplateParam(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 1000);
}

/** Constant-time string compare */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the App Secret). */
export async function verifyMetaSignature(
  appSecret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual("sha256=" + hex, header);
}

export interface InboundMessage {
  id: string;
  from: string;
  type: string; // text | audio | image | ...
  text?: string;
  audioId?: string;
  audioMime?: string;
  profileName?: string;
}

/** Pull user messages out of a WhatsApp Cloud API webhook payload (ignores status updates). */
// deno-lint-ignore no-explicit-any
export function parseInbound(payload: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c?.wa_id) names.set(c.wa_id, c?.profile?.name);
      }
      for (const m of value.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const msg: InboundMessage = { id: m.id, from: m.from, type: m.type, profileName: names.get(m.from) };
        if (m.type === "text") msg.text = m.text?.body ?? "";
        if (m.type === "button") msg.text = m.button?.text ?? "";
        if (m.type === "interactive") {
          msg.text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        }
        if (m.type === "audio") {
          msg.audioId = m.audio?.id;
          msg.audioMime = (m.audio?.mime_type ?? "audio/ogg").split(";")[0];
        }
        out.push(msg);
      }
    }
  }
  return out;
}
