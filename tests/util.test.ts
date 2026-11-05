import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict";
import {
  isWindowOpen,
  normalizePhone,
  parseInbound,
  rollForwardDaily,
  sanitizeTemplateParam,
  toIstIso,
  verifyMetaSignature,
} from "../supabase/functions/_shared/util.ts";

Deno.test("normalizePhone handles Indian formats", () => {
  assertEquals(normalizePhone("9876543210"), "919876543210");
  assertEquals(normalizePhone("+91 98765-43210"), "919876543210");
  assertEquals(normalizePhone("098765 43210"), "919876543210");
  assertEquals(normalizePhone("919876543210"), "919876543210");
  assertEquals(normalizePhone("12345"), null);
});

Deno.test("toIstIso shifts UTC to +05:30", () => {
  assertEquals(toIstIso(new Date("2026-11-05T17:50:00Z")), "2026-11-05T23:20:00+05:30");
});

Deno.test("rollForwardDaily moves past times to the next day", () => {
  const now = new Date("2026-11-05T17:50:00Z");
  const nineAmToday = new Date("2026-11-05T03:30:00Z");
  assertEquals(rollForwardDaily(nineAmToday, now).toISOString(), "2026-11-06T03:30:00.000Z");
  const future = new Date("2026-11-06T03:30:00Z");
  assertEquals(rollForwardDaily(future, now), future);
  const weekAgo = new Date("2026-10-29T03:30:00Z");
  assertEquals(rollForwardDaily(weekAgo, now).toISOString(), "2026-11-06T03:30:00.000Z");
});

Deno.test("isWindowOpen respects the 24h service window", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  assert(isWindowOpen("2026-11-05T01:00:00Z", now));
  assert(!isWindowOpen("2026-11-04T11:00:00Z", now));
  assert(!isWindowOpen(null, now));
});

Deno.test("sanitizeTemplateParam strips newlines and long spaces", () => {
  assertEquals(sanitizeTemplateParam("a\nb\t\tc      d"), "a b c   d");
});

Deno.test("verifyMetaSignature accepts valid and rejects tampered bodies", async () => {
  const secret = "test-secret";
  const body = '{"hello":"world"}';
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const header = "sha256=" + Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  assert(await verifyMetaSignature(secret, body, header));
  assert(!(await verifyMetaSignature(secret, body + " ", header)));
  assert(!(await verifyMetaSignature(secret, body, null)));
});

Deno.test("parseInbound extracts text and voice notes, ignores statuses", () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: "919876543210", profile: { name: "Jashwanth" } }],
          messages: [
            { id: "wamid.1", from: "919876543210", type: "text", text: { body: "Papa ko 9 baje yaad dilana" } },
            {
              id: "wamid.2",
              from: "919876543210",
              type: "audio",
              audio: { id: "media1", mime_type: "audio/ogg; codecs=opus" },
            },
          ],
          statuses: [{ id: "wamid.0", status: "delivered" }],
        },
      }],
    }],
  };
  const msgs = parseInbound(payload);
  assertEquals(msgs.length, 2);
  assertEquals(msgs[0].text, "Papa ko 9 baje yaad dilana");
  assertEquals(msgs[0].profileName, "Jashwanth");
  assertEquals(msgs[1].audioId, "media1");
  assertEquals(msgs[1].audioMime, "audio/ogg");
  assertEquals(parseInbound({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }).length, 0);
});
