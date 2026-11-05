// Sherr I — Cloudflare Worker entry point.
//   /webhook  -> WhatsApp messages from Meta
//   cron      -> every minute: reminders; 03:00 IST: privacy cleanup
import type { Env } from "./env.ts";
import { cleanup, runReminders } from "./reminders.ts";
import { handleWebhook } from "./webhook.ts";

const CLEANUP_CRON = "30 21 * * *";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/webhook") return handleWebhook(req, env, ctx);
    if (pathname === "/") return new Response("Sherr I 🐯 is running", { status: 200 });
    return new Response("not found", { status: 404 });
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === CLEANUP_CRON) ctx.waitUntil(cleanup(env));
    else ctx.waitUntil(runReminders(env).then((r) => console.log("reminders", JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
