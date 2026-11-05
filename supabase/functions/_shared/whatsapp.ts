// WhatsApp Cloud API (Meta) — direct, no reseller markup.
import { isWindowOpen, sanitizeTemplateParam } from "./util.ts";

const API_VERSION = Deno.env.get("WHATSAPP_API_VERSION") ?? "v23.0";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
// Approved Utility template, body e.g. "Sherr I update: {{1}}"
const TEMPLATE_NAME = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "";
const TEMPLATE_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en";

const base = () => `https://graph.facebook.com/${API_VERSION}`;

async function post(body: unknown): Promise<string | null> {
  const res = await fetch(`${base()}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("WhatsApp send failed", res.status, JSON.stringify(json?.error ?? json));
    return null;
  }
  return json?.messages?.[0]?.id ?? null;
}

export function sendText(to: string, text: string) {
  return post({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text.slice(0, 4000), preview_url: false },
  });
}

export function sendTemplate(to: string, param: string) {
  return post({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: [{ type: "body", parameters: [{ type: "text", text: sanitizeTemplateParam(param) }] }],
    },
  });
}

/**
 * Free-form text inside the 24h window (free), approved template outside it.
 * Returns the WhatsApp message id, or null if it could not be sent.
 */
export async function sendSmart(to: string, text: string, lastInboundAt: string | null | undefined) {
  if (isWindowOpen(lastInboundAt, new Date())) return await sendText(to, text);
  if (!TEMPLATE_NAME) {
    console.warn("24h window closed and WHATSAPP_TEMPLATE_NAME not set; trying plain text");
    return await sendText(to, text);
  }
  return await sendTemplate(to, text);
}

/** Download a voice note (or any media) by its media id. */
export async function downloadMedia(mediaId: string): Promise<Uint8Array | null> {
  const meta = await fetch(`${base()}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!meta.ok) return null;
  const { url } = await meta.json();
  if (!url) return null;
  const file = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!file.ok) return null;
  const buf = new Uint8Array(await file.arrayBuffer());
  return buf.byteLength > 15 * 1024 * 1024 ? null : buf;
}
