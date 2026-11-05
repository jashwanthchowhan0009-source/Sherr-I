export interface Env {
  DB: D1Database;

  // Meta / WhatsApp Cloud API (secrets)
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_VERIFY_TOKEN: string;
  // Gemini (secret)
  GEMINI_API_KEY: string;

  // Plain vars (wrangler.toml)
  WHATSAPP_API_VERSION?: string;
  WHATSAPP_TEMPLATE_NAME?: string; // approved Utility template, body like "Sherr I update: {{1}}"
  WHATSAPP_TEMPLATE_LANG?: string;
  GEMINI_MODEL?: string;
  ALLOWED_NUMBERS?: string; // comma separated; empty = everyone
  SHERR_DISPLAY_NUMBER?: string;

  // Only for local testing against mock servers
  WHATSAPP_API_BASE?: string;
  GEMINI_API_BASE?: string;
}
