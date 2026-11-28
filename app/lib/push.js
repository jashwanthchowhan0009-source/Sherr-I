// Sherr I texts you first: web push + exact-time delivery through Vercel Queues.
// No database: each job carries everything it needs (subscription, text, time).
// A job far in the future hops forward in ≤6-day steps until it is due.
import { hkdfSync, createECDH } from "node:crypto";
import * as webpush from "web-push";
import { chat, geminiKey, groqKey } from "./llm.js";

export const TOPIC = "sherr-push";
const DAY = 86_400_000;
const MAX_HOP_MS = 6 * DAY; // queue delay cap is 7 days
const SUBJECT = "https://sherr-i-app.vercel.app";
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const clean = (v) => (v || "").trim().replace(/^["']|["']$/g, "");

/** VAPID keys: explicit env pair if set, else derived one-way from the AI key so nothing new needs configuring. */
export function vapidKeys() {
  const pub = clean(process.env.SHERR_VAPID_PUBLIC), priv = clean(process.env.SHERR_VAPID_PRIVATE);
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const seed = geminiKey() || groqKey();
  if (!seed) return null;
  const key = Buffer.from(hkdfSync("sha256", seed, "sherr-i", "vapid-v1", 32));
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(key);
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(key) };
}

/** Only real browser push services, so the endpoint can't be used to make us call arbitrary URLs. */
export function validSub(sub) {
  try {
    const u = new URL(sub?.endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname)) &&
      typeof sub.keys?.p256dh === "string" && typeof sub.keys?.auth === "string";
  } catch {
    return false;
  }
}

/** Send one notification. Returns {ok} or {gone:true} when the browser dropped the subscription. */
export async function sendPush(sub, data, { sender = webpush.sendNotification } = {}) {
  const keys = vapidKeys();
  if (!keys) throw new Error("push not configured");
  try {
    await sender(sub, JSON.stringify(data), {
      TTL: 6 * 3600,
      urgency: data.type === "remind" ? "high" : "normal",
      topic: String(data.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
      vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
    });
    return { ok: true };
  } catch (e) {
    if (e?.statusCode === 404 || e?.statusCode === 410) return { gone: true };
    throw e;
  }
}

/** Put a job on the queue so it arrives at job.at (ISO). Long waits hop. */
export async function enqueue(job, { sendImpl, now = Date.now() } = {}) {
  const due = new Date(job.at).getTime();
  const deliverAt = Math.min(due, now + MAX_HOP_MS);
  const delaySeconds = Math.max(0, Math.round((deliverAt - now) / 1000));
  const hop = job.hop || 0;
  const send = sendImpl || (await import("@vercel/queue")).send;
  return send(TOPIC, job, {
    delaySeconds,
    retentionSeconds: Math.min(604_800, delaySeconds + DAY / 1000),
    idempotencyKey: `${job.kind}:${job.id}:${job.at}:h${hop}`.slice(0, 256),
  });
}

/** Next local HH:MM after now, as an ISO instant. tzOffset = minutes east of UTC (IST = 330). */
export function nextAt(time, tzOffset = 330, now = Date.now()) {
  const [hh, mm] = String(time || "08:00").split(":").map(Number);
  const local = new Date(now + tzOffset * 60_000);
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh || 0, mm || 0) - tzOffset * 60_000;
  if (t <= now + 30_000) t += DAY;
  return new Date(t).toISOString();
}

export async function geocode(city, fetchImpl = fetch) {
  if (!city) return null;
  try {
    const r = await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(city)}`);
    const g = (await r.json()).results?.[0];
    return g ? { city: g.name, lat: g.latitude, lon: g.longitude } : null;
  } catch {
    return null;
  }
}

const WX = { 0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 80: "showers", 81: "showers", 82: "heavy showers", 95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm" };

async function weather(place, fetchImpl) {
  if (!place?.lat) return null;
  try {
    const r = await fetchImpl(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=1`);
    const d = (await r.json()).daily;
    return { city: place.city, max: Math.round(d.temperature_2m_max[0]), min: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max[0], sky: WX[d.weather_code[0]] || "" };
  } catch {
    return null;
  }
}

/** The morning text, written like a friend would text it. Falls back to a template if AI is down. */
export async function briefText(job, { fetchImpl = fetch, chatImpl = chat, now = Date.now() } = {}) {
  const tz = job.tzOffset ?? 330;
  const day = new Date(now + tz * 60_000).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const wx = await weather(job.place, fetchImpl);
  const facts = [`Today: ${day}`, wx && `Weather in ${wx.city}: ${wx.sky}, ${wx.min}–${wx.max}°C, rain chance ${wx.rain}%`].filter(Boolean).join("\n");
  const fallback = `Good morning ${job.name || ""}! ${day}${wx ? ` · ${wx.city} ${wx.max}°, ${wx.sky}` : ""}. Aaj ka plan bolo, main yaad rakhunga.`.replace(/\s+/g, " ");
  try {
    const out = await chatImpl({
      model: "google/gemini-3-flash", fetchImpl, maxTokens: 160,
      messages: [
        { role: "system", content: `You are Sherr I, ${job.name || "the user"}'s personal assistant, texting them first thing in the morning. Write in ${job.language || "Hinglish"} like a close friend on WhatsApp: 1-2 short sentences, under 180 characters, at most one emoji. Use only the facts given (never invent events or festivals). If rain chance is 40% or more, mention an umbrella. End by asking what's on their plate today so you can remind them.` },
        { role: "user", content: facts },
      ],
    });
    const text = (out.content || "").trim().replace(/^"|"$/g, "");
    return text.length > 10 ? text.slice(0, 300) : fallback;
  } catch {
    return fallback;
  }
}

/** Run one queued job. Returns what happened (for logs and tests). */
export async function runJob(job, deps = {}) {
  const now = deps.now ?? Date.now();
  if (!job?.kind || !validSub(job.sub)) return "dropped";
  if (new Date(job.at).getTime() - now > 60_000) {
    await enqueue({ ...job, hop: (job.hop || 0) + 1 }, deps);
    return "hopped";
  }
  const send = (data) => sendPush(job.sub, data, deps);
  if (job.kind === "remind") {
    const res = await send({ type: "remind", id: job.id, title: "Sherr I", body: job.text, at: job.at });
    return res.gone ? "gone" : "sent";
  }
  if (job.kind === "brief") {
    const text = await briefText(job, deps);
    const res = await send({ type: "brief", id: `brief-${job.at.slice(0, 10)}`, title: "Sherr I", body: text, at: job.at });
    if (res.gone) return "gone"; // subscription changed or brief turned off: the chain ends here
    await enqueue({ ...job, hop: 0, at: nextAt(job.time, job.tzOffset, now + 60_000) }, deps);
    return "sent";
  }
  return "dropped";
}
