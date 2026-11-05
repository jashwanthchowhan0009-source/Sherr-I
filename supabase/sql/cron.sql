-- Run this ONCE in the Supabase SQL editor, after deploying the functions.
-- Replace the two placeholder values first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secrets live in Vault, not in plain SQL.
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'sherr_project_url');
select vault.create_secret('SAME-VALUE-AS-CRON_SECRET-ENV', 'sherr_cron_secret');

-- Every minute: send due reminders
select cron.schedule(
  'sherr-i-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sherr_project_url')
           || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sherr_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Every night: delete chat history older than 30 days (privacy)
select cron.schedule(
  'sherr-i-cleanup',
  '30 21 * * *', -- 03:00 IST
  $$ delete from public.messages where created_at < now() - interval '30 days'; $$
);
