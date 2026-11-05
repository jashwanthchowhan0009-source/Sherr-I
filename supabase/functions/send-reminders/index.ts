// Runs every minute (pg_cron). Sends due reminders and nudges the owner
// if a family member hasn't replied in 30 minutes.
import { type Contact, db, logMessage, type Reminder, type User } from "../_shared/db.ts";
import { rollForwardDaily, safeEqual } from "../_shared/util.ts";
import { sendSmart } from "../_shared/whatsapp.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const FOLLOWUP_AFTER_MS = 30 * 60 * 1000;

type Row = Reminder & { owner: User; contact: Contact | null };

Deno.serve(async (req) => {
  if (!CRON_SECRET || !safeEqual(req.headers.get("x-cron-secret") ?? "", CRON_SECRET)) {
    return new Response("forbidden", { status: 403 });
  }
  const now = new Date();
  const sent = await sendDue(now);
  const nudged = await sendFollowups(now);
  return Response.json({ ok: true, sent, nudged });
});

async function sendDue(now: Date): Promise<number> {
  const { data, error } = await db().from("reminders")
    .select("*, owner:users(*), contact:contacts(*)")
    .eq("status", "active").lte("next_run_at", now.toISOString())
    .order("next_run_at").limit(50);
  if (error) {
    console.error("load due failed", error);
    return 0;
  }

  let count = 0;
  for (const r of (data ?? []) as Row[]) {
    const next = r.repeat === "daily"
      ? { next_run_at: rollForwardDaily(new Date(r.next_run_at), now).toISOString() }
      : { status: "done" };
    const notActivated = r.contact && !r.contact.opted_in;

    // Claim the row first so two overlapping runs never double-send
    const { data: claimed } = await db().from("reminders")
      .update(notActivated ? next : { ...next, last_sent_at: now.toISOString(), followup_sent_at: null })
      .eq("id", r.id).eq("status", "active").eq("next_run_at", r.next_run_at)
      .select("id");
    if (!claimed?.length) continue;

    if (notActivated) {
      await tell(
        r.owner,
        `⚠️ ${r.contact!.name} ko reminder nahi gaya, kyunki unhone abhi Sherr I ko "Hi" nahi bheja.\n(${r.summary})`,
      );
      continue;
    }

    const to = r.contact ?? r.owner;
    const text = r.contact ? r.message : `⏰ ${r.message}`;
    const id = await sendSmart(to.phone, text, to.last_inbound_at);
    await logMessage(to.phone, "out", text, id);
    if (id) count++;
    else if (r.contact) await tell(r.owner, `⚠️ ${r.contact.name} ko reminder bhej nahi paya 😕\n(${r.summary})`);
  }
  return count;
}

async function sendFollowups(now: Date): Promise<number> {
  const { data } = await db().from("reminders")
    .select("*, owner:users(*), contact:contacts(*)")
    .not("contact_id", "is", null).is("followup_sent_at", null)
    .lte("last_sent_at", new Date(now.getTime() - FOLLOWUP_AFTER_MS).toISOString())
    .gte("last_sent_at", new Date(now.getTime() - 6 * 3600_000).toISOString())
    .limit(50);

  let count = 0;
  for (const r of (data ?? []) as Row[]) {
    const acked = r.last_ack_at && new Date(r.last_ack_at) >= new Date(r.last_sent_at!);
    if (acked || !r.contact) continue;
    const { data: claimed } = await db().from("reminders").update({ followup_sent_at: now.toISOString() })
      .eq("id", r.id).is("followup_sent_at", null).select("id");
    if (!claimed?.length) continue;
    await tell(r.owner, `⏳ ${r.contact.name} ne abhi tak reply nahi kiya.\n(${r.summary}) Ek call kar lo? 📞`);
    count++;
  }
  return count;
}

async function tell(owner: User, text: string) {
  const id = await sendSmart(owner.phone, text, owner.last_inbound_at);
  await logMessage(owner.phone, "out", text, id);
}
