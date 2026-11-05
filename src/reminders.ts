// Runs every minute: sends due reminders and nudges the owner
// if a family member hasn't replied in 30 minutes.
import { logMessage, type ReminderRow, remindersJoined, type User } from "./db.ts";
import type { Env } from "./env.ts";
import { rollForwardDaily } from "./util.ts";
import { sendSmart } from "./whatsapp.ts";

const FOLLOWUP_AFTER_MS = 30 * 60 * 1000;
const BATCH = 10; // keeps each run well inside the Workers free-plan limits

export async function runReminders(env: Env, now = new Date()) {
  const sent = await sendDue(env, now);
  const nudged = await sendFollowups(env, now);
  return { sent, nudged };
}

async function sendDue(env: Env, now: Date): Promise<number> {
  const rows = await remindersJoined(env, `r.status = 'active' AND r.next_run_at <= ?`, [now.toISOString()], BATCH);
  let count = 0;
  for (const r of rows) {
    const daily = r.repeat === "daily";
    const nextRun = daily ? rollForwardDaily(new Date(r.next_run_at), now).toISOString() : r.next_run_at;
    const status = daily ? "active" : "done";
    const notActivated = !!r.contact && !r.contact.opted_in;

    // Claim the row first so two overlapping runs never double-send
    const claim = notActivated
      ? await env.DB.prepare(
        `UPDATE reminders SET next_run_at = ?, status = ? WHERE id = ? AND status = 'active' AND next_run_at = ?`,
      ).bind(nextRun, status, r.id, r.next_run_at).run()
      : await env.DB.prepare(
        `UPDATE reminders SET next_run_at = ?, status = ?, last_sent_at = ?, followup_sent_at = NULL
         WHERE id = ? AND status = 'active' AND next_run_at = ?`,
      ).bind(nextRun, status, now.toISOString(), r.id, r.next_run_at).run();
    if (!claim.meta.changes) continue;

    if (notActivated) {
      await tell(
        env,
        r.owner,
        `⚠️ ${r.contact!.name} ko reminder nahi gaya, kyunki unhone abhi Sherr I ko "Hi" nahi bheja.\n(${r.summary})`,
      );
      continue;
    }

    const to = r.contact ?? r.owner;
    const text = r.contact ? r.message : `⏰ ${r.message}`;
    const id = await sendSmart(env, to.phone, text, to.last_inbound_at);
    await logMessage(env, to.phone, "out", text, id);
    if (id) count++;
    else if (r.contact) await tell(env, r.owner, `⚠️ ${r.contact.name} ko reminder bhej nahi paya 😕\n(${r.summary})`);
  }
  return count;
}

async function sendFollowups(env: Env, now: Date): Promise<number> {
  const rows: ReminderRow[] = await remindersJoined(
    env,
    `r.contact_id IS NOT NULL AND r.followup_sent_at IS NULL AND r.last_sent_at <= ? AND r.last_sent_at >= ?
     AND (r.last_ack_at IS NULL OR r.last_ack_at < r.last_sent_at)`,
    [new Date(now.getTime() - FOLLOWUP_AFTER_MS).toISOString(), new Date(now.getTime() - 6 * 3600_000).toISOString()],
    BATCH,
  );
  let count = 0;
  for (const r of rows) {
    const claim = await env.DB.prepare(
      `UPDATE reminders SET followup_sent_at = ? WHERE id = ? AND followup_sent_at IS NULL`,
    ).bind(now.toISOString(), r.id).run();
    if (!claim.meta.changes || !r.contact) continue;
    await tell(env, r.owner, `⏳ ${r.contact.name} ne abhi tak reply nahi kiya.\n(${r.summary}) Ek call kar lo? 📞`);
    count++;
  }
  return count;
}

async function tell(env: Env, owner: User, text: string) {
  const id = await sendSmart(env, owner.phone, text, owner.last_inbound_at);
  await logMessage(env, owner.phone, "out", text, id);
}

/** Privacy: delete chat history older than 30 days. */
export async function cleanup(env: Env) {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  await env.DB.prepare(`DELETE FROM messages WHERE created_at < ?`).bind(cutoff).run();
}
