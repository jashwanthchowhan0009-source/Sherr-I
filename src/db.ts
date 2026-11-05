// Tiny data layer over Cloudflare D1 (SQLite).
import type { Env } from "./env.ts";

export interface User {
  id: string;
  phone: string;
  name: string | null;
  language: string;
  last_inbound_at: string | null;
}

export interface Contact {
  id: string;
  owner_id: string;
  name: string;
  relation: string | null;
  phone: string;
  language: string;
  opted_in: number; // 0 | 1
  last_inbound_at: string | null;
}

export interface Reminder {
  id: string;
  owner_id: string;
  contact_id: string | null;
  message: string;
  summary: string;
  next_run_at: string;
  repeat: "none" | "daily";
  status: "active" | "done" | "cancelled";
  last_sent_at: string | null;
  last_ack_at: string | null;
  followup_sent_at: string | null;
}

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

/** Returns false if this WhatsApp message id was already stored (duplicate webhook delivery). */
export async function logMessage(
  env: Env,
  phone: string,
  direction: "in" | "out",
  body: string,
  waId?: string | null,
): Promise<boolean> {
  const r = await env.DB.prepare(
    `INSERT INTO messages (phone, direction, body, wa_message_id, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(wa_message_id) DO NOTHING`,
  ).bind(phone, direction, body, waId ?? null, nowIso()).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function getUserByPhone(env: Env, phone: string): Promise<User | null> {
  return await env.DB.prepare(`SELECT * FROM users WHERE phone = ?`).bind(phone).first<User>();
}

export async function getOrCreateUser(env: Env, phone: string, name: string | undefined): Promise<User> {
  const existing = await getUserByPhone(env, phone);
  if (existing) return existing;
  await env.DB.prepare(
    `INSERT INTO users (id, phone, name, last_inbound_at, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(phone) DO NOTHING`,
  ).bind(newId(), phone, name ?? null, nowIso(), nowIso()).run();
  return (await getUserByPhone(env, phone))!;
}

export async function contactsOf(env: Env, ownerId: string): Promise<Contact[]> {
  const r = await env.DB.prepare(`SELECT * FROM contacts WHERE owner_id = ? ORDER BY created_at`).bind(ownerId)
    .all<Contact>();
  return r.results ?? [];
}

export type ContactWithOwner = Contact & { owner: User };

export async function contactsByPhone(env: Env, phone: string): Promise<ContactWithOwner[]> {
  const r = await env.DB.prepare(
    `SELECT c.*, u.phone AS o_phone, u.name AS o_name, u.language AS o_language, u.last_inbound_at AS o_last
     FROM contacts c JOIN users u ON u.id = c.owner_id WHERE c.phone = ?`,
  ).bind(phone).all<any>();
  return (r.results ?? []).map((row) => ({
    ...row,
    owner: { id: row.owner_id, phone: row.o_phone, name: row.o_name, language: row.o_language, last_inbound_at: row.o_last },
  }));
}

export type ReminderRow = Reminder & { owner: User; contact: Contact | null };

/** Reminders joined with their owner and (optional) contact. */
export async function remindersJoined(env: Env, where: string, binds: unknown[], limit = 10): Promise<ReminderRow[]> {
  const r = await env.DB.prepare(
    `SELECT r.*,
            u.phone AS o_phone, u.name AS o_name, u.language AS o_language, u.last_inbound_at AS o_last,
            c.name AS c_name, c.phone AS c_phone, c.language AS c_language, c.opted_in AS c_opted_in,
            c.relation AS c_relation, c.last_inbound_at AS c_last
     FROM reminders r JOIN users u ON u.id = r.owner_id LEFT JOIN contacts c ON c.id = r.contact_id
     WHERE ${where} ORDER BY r.next_run_at LIMIT ${Math.floor(limit)}`,
  ).bind(...binds).all<any>();
  return (r.results ?? []).map((row) => ({
    ...row,
    owner: { id: row.owner_id, phone: row.o_phone, name: row.o_name, language: row.o_language, last_inbound_at: row.o_last },
    contact: row.contact_id
      ? {
        id: row.contact_id,
        owner_id: row.owner_id,
        name: row.c_name,
        relation: row.c_relation,
        phone: row.c_phone,
        language: row.c_language,
        opted_in: row.c_opted_in,
        last_inbound_at: row.c_last,
      }
      : null,
  }));
}
