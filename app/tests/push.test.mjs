import { test } from "node:test";
import assert from "node:assert/strict";
import * as webpush from "web-push";

process.env.GEMINI_API_KEY = "test-key";
const P = await import("../lib/push.js");
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };

test("VAPID keys derive stably from the AI key and are valid", () => {
  const a = P.vapidKeys(), b = P.vapidKeys();
  assert.deepEqual(a, b);
  const hdr = webpush.getVapidHeaders("https://fcm.googleapis.com", "https://sherr-i-app.vercel.app", a.publicKey, a.privateKey, "aes128gcm");
  assert.match(hdr.Authorization, /^vapid t=/);
});

test("only real push services are accepted", () => {
  assert.equal(P.validSub(sub), true);
  assert.equal(P.validSub({ ...sub, endpoint: "https://evil.example.com/x" }), false);
  assert.equal(P.validSub({ ...sub, endpoint: "http://fcm.googleapis.com/x" }), false);
  assert.equal(P.validSub({ endpoint: sub.endpoint }), false);
});

test("nextAt picks the next local 8:00 IST", () => {
  const now = Date.parse("2026-11-28T03:00:00Z"); // 08:30 IST
  assert.equal(P.nextAt("08:00", 330, now), "2026-11-29T02:30:00.000Z");
  assert.equal(P.nextAt("09:00", 330, now), "2026-11-28T03:30:00.000Z");
});

test("far-future jobs hop; due reminders push; gone subscriptions stop", async () => {
  const now = Date.parse("2026-11-28T00:00:00Z");
  const sent = [], queued = [];
  const deps = { now, sendImpl: async (t, job, o) => { queued.push({ job, o }); return {}; }, sender: async (s, body) => { sent.push(JSON.parse(body)); } };
  assert.equal(await P.runJob({ kind: "remind", id: "r1", sub, text: "Call Amma", at: "2026-12-20T00:00:00Z" }, deps), "hopped");
  assert.equal(queued[0].o.delaySeconds, 6 * 86400);
  assert.equal(queued[0].job.hop, 1);
  assert.equal(await P.runJob({ kind: "remind", id: "r1", sub, text: "Call Amma", at: "2026-11-28T00:00:20Z" }, deps), "sent");
  assert.equal(sent[0].body, "Call Amma");
  const gone = { ...deps, sender: async () => { const e = new Error("gone"); e.statusCode = 410; throw e; } };
  assert.equal(await P.runJob({ kind: "remind", id: "r2", sub, text: "x", at: "2026-11-28T00:00:00Z" }, gone), "gone");
  assert.equal(await P.runJob({ kind: "remind", id: "r3", sub: { endpoint: "https://evil.example.com" }, text: "x", at: "2026-11-28T00:00:00Z" }, deps), "dropped");
});

test("brief sends a friendly text and schedules tomorrow", async () => {
  const now = Date.parse("2026-11-28T02:30:00Z");
  const sent = [], queued = [];
  const deps = {
    now,
    sendImpl: async (t, job, o) => { queued.push({ job, o }); return {}; },
    sender: async (s, body) => { sent.push(JSON.parse(body)); },
    fetchImpl: async () => new Response(JSON.stringify({ daily: { temperature_2m_max: [31.4], temperature_2m_min: [19.2], precipitation_probability_max: [60], weather_code: [61] } })),
    chatImpl: async ({ messages }) => ({ content: messages[1].content.includes("light rain") ? "Good morning! Aaj baarish ho sakti hai, chhata le lena. Aaj kya plan hai?" : "?" }),
  };
  const job = { kind: "brief", id: "b1", sub, time: "08:00", tzOffset: 330, place: { city: "Anantapur", lat: 14.68, lon: 77.6 }, name: "Jashwanth", at: "2026-11-28T02:30:00.000Z" };
  assert.equal(await P.runJob(job, deps), "sent");
  assert.match(sent[0].body, /chhata/);
  assert.equal(queued[0].job.at, "2026-11-29T02:30:00.000Z");
});
