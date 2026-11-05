// End-to-end test: runs the real Worker locally (wrangler dev + local D1)
// against mock WhatsApp and Gemini servers, and walks through the Papa flow.
//   npm run test:e2e
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { writeFileSync, rmSync } from "node:fs";
import { createHmac } from "node:crypto";
import { ok, equal } from "node:assert/strict";

const MOCK_PORT = 9911;
const WORKER_PORT = 8799;
const SECRET = "e2e-app-secret";
const OWNER = "919000000001";
const PAPA = "919000000002";

type Sent = { to: string; text: string; kind: string };
const sent: Sent[] = [];
let geminiCalls = 0;

// ---------- mock WhatsApp + Gemini ----------
const mock = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const json = body ? JSON.parse(body) : {};
  res.setHeader("Content-Type", "application/json");

  if (req.url?.includes("/messages")) {
    const text = json.type === "text" ? json.text.body : json.template?.components?.[0]?.parameters?.[0]?.text;
    sent.push({ to: json.to, text, kind: json.type });
    return res.end(JSON.stringify({ messages: [{ id: `wamid.out.${sent.length}` }] }));
  }

  if (req.url?.includes(":generateContent")) {
    geminiCalls++;
    const last = json.contents[json.contents.length - 1];
    const fr = last.parts.find((p: any) => p.functionResponse);
    if (fr) {
      const r = fr.functionResponse.response;
      return res.end(JSON.stringify(reply({ text: r.ok ? `Done ✅ ${fr.functionResponse.name}` : `Error: ${r.error}` })));
    }
    const said = (last.parts.find((p: any) => p.text)?.text ?? "").toLowerCase();
    if (said.includes("add papa")) {
      return res.end(JSON.stringify(reply({
        functionCall: {
          name: "add_family_member",
          args: { name: "Papa", relation: "father", phone: "90000 00002", language: "telugu" },
        },
      })));
    }
    if (said.includes("remind papa")) {
      return res.end(JSON.stringify(reply({
        functionCall: {
          name: "create_reminder",
          args: {
            for_whom: "Papa",
            first_time: new Date(Date.now() + 2000).toISOString(),
            repeat: "daily",
            message_for_recipient: "Papa garu, BP tablet vesukune time ayindi 💊",
            summary: "Papa BP tablet",
          },
        },
      })));
    }
    return res.end(JSON.stringify(reply({ text: "Namaste! Main Sherr I 🐯" })));
  }

  res.statusCode = 404;
  res.end("{}");
});
const reply = (part: any) => ({ candidates: [{ content: { role: "model", parts: [part] } }] });

// ---------- helpers ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let msgN = 0;

async function waMessage(from: string, text: string, id = `wamid.in.${++msgN}`) {
  const payload = JSON.stringify({
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: from, profile: { name: from === OWNER ? "Jashwanth" : "Papa" } }],
          messages: [{ id, from, type: "text", text: { body: text } }],
        },
      }],
    }],
  });
  const sig = "sha256=" + createHmac("sha256", SECRET).update(payload).digest("hex");
  const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hub-signature-256": sig },
    body: payload,
  });
  equal(res.status, 200);
  return id;
}

async function waitFor(pred: () => boolean, label: string, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return;
    await sleep(150);
  }
  throw new Error(`timeout: ${label}\nsent so far: ${JSON.stringify(sent, null, 2)}`);
}

const to = (phone: string) => sent.filter((s) => s.to === phone);
const step = (s: string) => console.log(`\n▶ ${s}`);

// ---------- run ----------
async function main() {
  await new Promise<void>((r) => mock.listen(MOCK_PORT, r));

  writeFileSync(
    ".dev.vars",
    [
      `WHATSAPP_ACCESS_TOKEN=test`,
      `WHATSAPP_PHONE_NUMBER_ID=123`,
      `WHATSAPP_APP_SECRET=${SECRET}`,
      `WHATSAPP_VERIFY_TOKEN=verify-me`,
      `GEMINI_API_KEY=test`,
      `WHATSAPP_API_BASE=http://127.0.0.1:${MOCK_PORT}`,
      `GEMINI_API_BASE=http://127.0.0.1:${MOCK_PORT}`,
    ].join("\n"),
  );
  rmSync(".wrangler/state", { recursive: true, force: true });
  execSync("npx wrangler d1 migrations apply sherr-i --local", { stdio: "ignore" });

  const worker = spawn("npx", ["wrangler", "dev", "--port", String(WORKER_PORT), "--test-scheduled"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  worker.stdout.on("data", (d) => (logs += d));
  worker.stderr.on("data", (d) => (logs += d));

  try {
    await waitFor(() => logs.includes("Ready on"), "worker start", 60000);

    step("Webhook verification (GET)");
    const v = await fetch(
      `http://127.0.0.1:${WORKER_PORT}/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42`,
    );
    equal(await v.text(), "42");
    equal((await fetch(`http://127.0.0.1:${WORKER_PORT}/webhook?hub.mode=subscribe&hub.verify_token=nope`)).status, 403);

    step("Fake (unsigned) request is rejected");
    const bad = await fetch(`http://127.0.0.1:${WORKER_PORT}/webhook`, {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body: "{}",
    });
    equal(bad.status, 401);

    step("Owner says Hi → Sherr I replies");
    const firstId = await waMessage(OWNER, "Hi");
    await waitFor(() => to(OWNER).length === 1, "reply to owner");
    ok(to(OWNER)[0].text.includes("Sherr I"));

    step("Same message delivered twice → processed once");
    const callsBefore = geminiCalls;
    await waMessage(OWNER, "Hi", firstId);
    await sleep(1500);
    equal(to(OWNER).length, 1);
    equal(geminiCalls, callsBefore);

    step("Owner adds Papa");
    await waMessage(OWNER, "add papa 9000000002 telugu");
    await waitFor(() => to(OWNER).length === 2, "add confirmation");
    ok(to(OWNER)[1].text.includes("add_family_member"), to(OWNER)[1].text);

    step("Papa sends Hi → activated, welcomed in Telugu, owner notified");
    await waMessage(PAPA, "Hi");
    await waitFor(() => to(PAPA).length === 1 && to(OWNER).length === 3, "activation");
    ok(to(PAPA)[0].text.includes("Namaskaram"), to(PAPA)[0].text);
    ok(to(OWNER)[2].text.includes("activate"), to(OWNER)[2].text);

    step("Owner: remind Papa daily");
    await waMessage(OWNER, "remind papa daily 9 baje BP tablet");
    await waitFor(() => to(OWNER).length === 4, "reminder confirmation");
    ok(to(OWNER)[3].text.includes("create_reminder"), to(OWNER)[3].text);

    step("Cron fires → Papa gets the reminder");
    await sleep(2500);
    const cron = await fetch(`http://127.0.0.1:${WORKER_PORT}/cdn-cgi/handler/scheduled?cron=*+*+*+*+*`);
    ok(cron.ok, `scheduled endpoint ${cron.status}`);
    await waitFor(() => to(PAPA).length === 2, "reminder to papa");
    ok(to(PAPA)[1].text.includes("BP tablet"));

    step("Cron again → no double send (daily, next is tomorrow)");
    await fetch(`http://127.0.0.1:${WORKER_PORT}/cdn-cgi/handler/scheduled?cron=*+*+*+*+*`);
    await sleep(1500);
    equal(to(PAPA).length, 2);

    step("Papa replies 'vesukunna' → thanked, owner gets ✅");
    await waMessage(PAPA, "vesukunna");
    await waitFor(() => to(PAPA).length === 3 && to(OWNER).length === 5, "ack");
    ok(to(PAPA)[2].text.includes("andi"), to(PAPA)[2].text);
    ok(to(OWNER)[4].text.includes("vesukunna"), to(OWNER)[4].text);

    step("Database state");
    const out = execSync(
      `npx wrangler d1 execute sherr-i --local --json --command "SELECT r.repeat, r.status, r.last_ack_text, c.opted_in FROM reminders r JOIN contacts c ON c.id = r.contact_id"`,
    ).toString();
    const row = JSON.parse(out)[0].results[0];
    equal(row.last_ack_text, "vesukunna");
    equal(row.status, "active");
    equal(row.opted_in, 1);

    console.log("\n✅ All end-to-end checks passed\n");
    console.log("Conversation:");
    for (const s of sent) console.log(`  → ${s.to === OWNER ? "Jashwanth" : "Papa"}: ${s.text}`);
  } catch (e) {
    console.error(logs.slice(-3000));
    throw e;
  } finally {
    worker.kill("SIGTERM");
    mock.close();
    rmSync(".dev.vars", { force: true });
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
