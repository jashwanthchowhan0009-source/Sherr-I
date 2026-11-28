// /api/push — turn on "Sherr I texts you": reminders and the morning brief arrive as notifications,
// even when the app is closed. GET gives the public key; POST schedules.
import { vapidKeys, validSub, sendPush, enqueue, nextAt, geocode } from "../lib/push.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 60;
}
const str = (v, n) => String(v ?? "").slice(0, n);
const id = (v) => str(v, 64).replace(/[^\w-]/g, "") || Math.random().toString(36).slice(2, 10);

export function GET() {
  const keys = vapidKeys();
  return json({ ok: !!keys, publicKey: keys?.publicKey || null });
}

export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return json({ error: "slow_down" }, 429);
  if (Number(request.headers.get("content-length") || 0) > 20_000) return json({ error: "too_large" }, 413);
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!vapidKeys()) return json({ error: "push_not_configured" }, 503);
  if (!validSub(b.sub)) return json({ error: "bad_subscription" }, 400);
  const sub = { endpoint: b.sub.endpoint, keys: { p256dh: str(b.sub.keys.p256dh, 200), auth: str(b.sub.keys.auth, 100) } };

  try {
    switch (b.op) {
      case "hello": {
        const name = str(b.name, 40);
        const res = await sendPush(sub, { type: "hello", id: "hello", title: "Sherr I",
          body: `${name ? name + ", " : ""}ab main tumhe yahin text karunga: reminders, subah ka brief, sab. 🐯` });
        return json({ ok: !res.gone });
      }
      case "remind":
      case "snooze": {
        const at = b.op === "snooze" ? new Date(Date.now() + Math.min(Math.max(Number(b.minutes) || 10, 1), 1440) * 60_000) : new Date(b.at);
        if (Number.isNaN(at.getTime())) return json({ error: "bad_time" }, 400);
        if (at.getTime() > Date.now() + 366 * 86_400_000) return json({ error: "too_far" }, 400);
        await enqueue({ kind: "remind", id: id(b.id), sub, text: str(b.text, 300) || "Reminder", at: at.toISOString() });
        return json({ ok: true, at: at.toISOString() });
      }
      case "brief": {
        const time = /^\d{2}:\d{2}$/.test(b.time) ? b.time : "08:00";
        const tzOffset = Math.max(-720, Math.min(840, Number(b.tzOffset) || 330));
        const place = await geocode(str(b.city, 60));
        const at = nextAt(time, tzOffset);
        await enqueue({ kind: "brief", id: id(b.id), sub, time, tzOffset, place, name: str(b.name, 40), language: str(b.language, 20), at });
        return json({ ok: true, at, city: place?.city || null });
      }
      default:
        return json({ error: "bad_op" }, 400);
    }
  } catch (e) {
    console.error("push op failed", b.op, e?.message || e);
    return json({ error: "push_failed" }, 502);
  }
}
