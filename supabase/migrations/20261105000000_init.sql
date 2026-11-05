-- Sherr I: initial schema
-- All tables have RLS ON with NO policies, so only the service role
-- (our Edge Functions) can read or write. Nobody can query data from a
-- browser with the anon key.

create extension if not exists pgcrypto;

-- People who talk to Sherr I and own reminders
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique,            -- digits only, with country code (e.g. 9198xxxxxxxx)
  name            text,
  language        text not null default 'hinglish',
  last_inbound_at timestamptz,                     -- for WhatsApp 24h service window
  created_at      timestamptz not null default now()
);

-- Family members a user adds (Papa, Amma, ...)
create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.users(id) on delete cascade,
  name            text not null,
  relation        text,
  phone           text not null,
  language        text not null default 'english',
  opted_in        boolean not null default false,  -- true after they message Sherr I once
  last_inbound_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (owner_id, phone)
);
create index if not exists contacts_phone_idx on public.contacts (phone);

create table if not exists public.reminders (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.users(id) on delete cascade,
  contact_id       uuid references public.contacts(id) on delete cascade, -- null = reminder for the owner
  message          text not null,                 -- what gets sent, in the recipient's language
  summary          text not null,                 -- short owner-facing description
  next_run_at      timestamptz not null,
  repeat           text not null default 'none' check (repeat in ('none', 'daily')),
  status           text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  last_sent_at     timestamptz,
  last_ack_at      timestamptz,
  last_ack_text    text,
  followup_sent_at timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (next_run_at) where status = 'active';
create index if not exists reminders_contact_idx on public.reminders (contact_id, last_sent_at);

-- Short chat history for context + webhook de-duplication.
-- Auto-deleted after 30 days (see supabase/sql/cron.sql).
create table if not exists public.messages (
  id            bigint generated always as identity primary key,
  phone         text not null,
  direction     text not null check (direction in ('in', 'out')),
  body          text not null,
  wa_message_id text unique,
  created_at    timestamptz not null default now()
);
create index if not exists messages_phone_idx on public.messages (phone, created_at desc);

alter table public.users     enable row level security;
alter table public.contacts  enable row level security;
alter table public.reminders enable row level security;
alter table public.messages  enable row level security;
