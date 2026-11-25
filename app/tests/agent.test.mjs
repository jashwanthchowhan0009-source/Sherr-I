import { test } from "node:test";
import assert from "node:assert/strict";
import { flightLinks, hotelLinks, normalizePhone, smsLink, trainLinks, whatsappLink, calendarLink } from "../lib/links.js";
import { respond, runTool, ALL_POWERS } from "../lib/agent.js";

test("phone numbers", () => {
  assert.equal(normalizePhone("98765 43210"), "919876543210");
  assert.equal(normalizePhone("+91-98765-43210"), "919876543210");
  assert.equal(normalizePhone("098765 43210"), "919876543210");
  assert.equal(normalizePhone("123"), null);
});

test("deep links", () => {
  assert.equal(whatsappLink("9876543210", "hi papa"), "https://wa.me/919876543210?text=hi%20papa");
  assert.equal(whatsappLink(null, "hi"), "https://wa.me/?text=hi");
  assert.equal(smsLink("9876543210", "ok"), "sms:+919876543210?body=ok");
  assert.match(flightLinks({ from: "Hyderabad", to: "New Delhi" })[0].url, /makemytrip\.com\/flights\/hyderabad-new-delhi-cheap-airtickets\.html$/);
  assert.match(trainLinks({ from: "Anantapur", to: "Hyderabad" })[0].url, /ixigo\.com\/by-train-rail\/anantapur-to-hyderabad-by-train$/);
  const b = hotelLinks({ city: "Goa", checkin: "2026-12-01", checkout: "2026-12-03", guests: 2 })[1].url;
  assert.match(b, /booking\.com.*ss=Goa.*checkin=2026-12-01.*checkout=2026-12-03/);
  assert.match(calendarLink("Call Amma", "2026-12-01T13:30:00.000Z"), /dates=20261201T133000Z\/20261201T140000Z/);
});

test("whatsapp uses saved contact and always needs a tap", async () => {
  const r = await runTool("send_whatsapp", { to_name: "papa", message: "Reaching by 8" }, { contacts: [{ name: "Papa", phone: "9876543210" }] });
  assert.equal(r.action.confirm, true);
  assert.equal(r.action.url, "https://wa.me/919876543210?text=Reaching%20by%208");
});

test("call without number is refused, never invented", async () => {
  const r = await runTool("make_call", { to_name: "Ravi" }, { contacts: [] });
  assert.equal(r.result.ok, false);
  assert.equal(r.action, undefined);
});

test("bad hotel dates are rejected", async () => {
  const r = await runTool("find_hotels", { city: "Goa", checkin: "2026-12-03", checkout: "2026-12-01" }, {});
  assert.equal(r.result.ok, false);
});

// Fake AI Gateway: first turn asks for a tool, second turn replies.
function fakeGateway(sequence) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const next = sequence.shift();
    return new Response(JSON.stringify({ choices: [{ message: next }] }), { status: 200 });
  };
  return { fetchImpl, calls };
}

test("agent loop: tool call -> action card -> reply", async () => {
  const { fetchImpl, calls } = fakeGateway([
    { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "find_trains", arguments: JSON.stringify({ from: "Anantapur", to: "Hyderabad", date: "2026-12-02" }) } }] },
    { role: "assistant", content: "Trains ready, neeche dekho 👇" },
  ]);
  const out = await respond(
    { messages: [{ role: "user", content: "kal Anantapur se Hyderabad train" }], profile: { name: "Jashwanth" } },
    { gatewayToken: "test", fetchImpl },
  );
  assert.equal(out.reply, "Trains ready, neeche dekho 👇");
  assert.equal(out.actions[0].type, "links");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages.at(-1).role, "tool");
  assert.equal(calls[0].tools.length >= ALL_POWERS.length, true);
  assert.match(calls[0].messages[0].content, /Jashwanth/);
});

test("powers switched off remove their tools", async () => {
  const { fetchImpl, calls } = fakeGateway([{ role: "assistant", content: "ok" }]);
  await respond({ messages: [{ role: "user", content: "hi" }], powers: ["reminders"] }, { gatewayToken: "t", fetchImpl });
  assert.deepEqual(calls[0].tools.map((t) => t.function.name), ["set_reminder"]);
});

test("ask_model routes to the named model", async () => {
  const { fetchImpl, calls } = fakeGateway([{ role: "assistant", content: "Take the 16GB one." }]);
  const r = await runTool("ask_model", { model: "claude", question: "which laptop?" }, { gatewayToken: "t", fetchImpl });
  assert.match(calls[0].model, /^anthropic\//);
  assert.equal(r.action.model, "Claude");
});
