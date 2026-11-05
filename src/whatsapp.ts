// WhatsApp Cloud API (Meta) — direct, no reseller markup.
import type { Env } from "./env.ts";
import { isWindowOpen, sanitizeTemplateParam } from "./util.ts";

const base = (env: Env) =>
  `${env.WHATSAPP_API_BASE ?? "https://graph.facebook.com"}/${env.WHATSAPP_API_VERSION ?? "v23.0"}`;

async function post(env: Env, body: unknown): Promise<string | null> {
  const res = await fetch(`${base(env)}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("WhatsApp send failed", res.status, JSON.stringify(json?.error ?? json));
    return null;
  }
  return json?.messages?.[0]?.id ?? null;
}

export function sendText(env: Env, to: string, text: string) {
  return post(env, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text.slice(0, 4000), preview_url: false },
  });
}

export function sendTemplate(env: Env, to: string, param: string) {
  return post(env, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANG ?? "en" },
      components: [{ type: "body", parameters: [{ type: "text", text: sanitizeTemplateParam(param) }] }],
    },
  });
}

/** Free-form text inside the 24h window (free), approved template outside it. */
export async function sendSmart(env: Env, to: string, text: string, lastInboundAt: string | null | undefined) {
  if (isWindowOpen(lastInboundAt, new Date())) return await sendText(env, to, text);
  if (!env.WHATSAPP_TEMPLATE_NAME) {
    console.warn("24h window closed and WHATSAPP_TEMPLATE_NAME not set; trying plain text");
    return await sendText(env, to, text);
  }
  return await sendTemplate(env, to, text);
}

/** Download a voice note by its media id (max 15 MB). */
export async function downloadMedia(env: Env, mediaId: string): Promise<Uint8Array | null> {
  const auth = { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetch(`${base(env)}/${mediaId}`, { headers: auth });
  if (!meta.ok) return null;
  const { url } = (await meta.json()) as { url?: string };
  if (!url) return null;
  const file = await fetch(url, { headers: auth });
  if (!file.ok) return null;
  const buf = new Uint8Array(await file.arrayBuffer());
  return buf.byteLength > 15 * 1024 * 1024 ? null : buf;
}
