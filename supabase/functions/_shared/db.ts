import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

let client: SupabaseClient | null = null;

/** Service-role client. Only ever used server-side inside Edge Functions. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return client;
}

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
  opted_in: boolean;
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

export async function logMessage(phone: string, direction: "in" | "out", body: string, waId?: string | null) {
  const { error } = await db().from("messages").insert({ phone, direction, body, wa_message_id: waId ?? null });
  return !error; // false on duplicate wa_message_id => already processed
}
