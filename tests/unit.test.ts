import { test } from "node:test";
import { deepStrictEqual as eq, ok } from "node:assert/strict";
import {
  isWindowOpen,
  normalizePhone,
  parseInbound,
  rollForwardDaily,
  sanitizeTemplateParam,
  toIstIso,
  verifyMetaSignature,
} from "../src/util.ts";
import { thanksLine, welcomeLine } from "../src/i18n.ts";

test("normalizePhone handles Indian formats", () => {
  eq(normalizePhone("9876543210"), "919876543210");
  eq(normalizePhone("+91 98765-43210"), "919876543210");
  eq(normalizePhone("098765 43210"), "919876543210");
  eq(normalizePhone("919876543210"), "919876543210");
  eq(normalizePhone("12345"), null);
});

test("toIstIso shifts UTC to +05:30", () => {
  eq(toIstIso(new Date("2026-11-05T17:50:00Z")), "2026-11-05T23:20:00+05:30");
});

test("rollForwardDaily moves past times to the next day", () => {
  const now = new Date("2026-11-05T17:50:00Z");
  eq(rollForwardDaily(new Date("2026-11-05T03:30:00Z"), now).toISOString(), "2026-11-06T03:30:00.000Z");
  const future = new Date("2026-11-06T03:30:00Z");
  eq(rollForwardDaily(future, now), future);
  eq(rollForwardDaily(new Date("2026-10-29T03:30:00Z"), now).toISOString(), "2026-11-06T03:30:00.000Z");
});

test("isWindowOpen respects the 24h service window", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  ok(isWindowOpen("2026-11-05T01:00:00Z", now));
  ok(!isWindowOpen("2026-11-04T11:00:00Z", now));
  ok(!isWindowOpen(null, now));
});

test("sanitizeTemplateParam strips newlines and long spaces", () => {
  eq(sanitizeTemplateParam("a\nb\t\tc      d"), "a b c   d");
});

test("verifyMetaSignature accepts valid and rejects tampered bodies", async () => {
  const secret = "test-secret";
  const body = '{"hello":"world"}';
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {
    name: "HMAC",
    hash: "SHA-256",
  }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const header = "sha256=" + Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  ok(await verifyMetaSignature(secret, body, header));
  ok(!(await verifyMetaSignature(secret, body + " ", header)));
  ok(!(await verifyMetaSignature(secret, body, null)));
});

test("parseInbound extracts text and voice notes, ignores statuses", () => {
  const msgs = parseInbound({
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: "919876543210", profile: { name: "Jashwanth" } }],
          messages: [
            { id: "wamid.1", from: "919876543210", type: "text", text: { body: "Papa ko 9 baje yaad dilana" } },
            { id: "wamid.2", from: "919876543210", type: "audio", audio: { id: "m1", mime_type: "audio/ogg; codecs=opus" } },
          ],
          statuses: [{ id: "wamid.0", status: "delivered" }],
        },
      }],
    }],
  });
  eq(msgs.length, 2);
  eq(msgs[0].text, "Papa ko 9 baje yaad dilana");
  eq(msgs[0].profileName, "Jashwanth");
  eq(msgs[1].audioId, "m1");
  eq(msgs[1].audioMime, "audio/ogg");
  eq(parseInbound({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }).length, 0);
});

test("language lines fall back to English", () => {
  ok(thanksLine("telugu").includes("andi"));
  ok(thanksLine("klingon").startsWith("Thank you"));
  ok(welcomeLine("telugu", "Jashwanth").includes("Jashwanth"));
});
