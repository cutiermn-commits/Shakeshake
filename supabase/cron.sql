-- Scheduler setup (D-021). Run ONCE in the Supabase SQL editor AFTER deploying the app.
-- Why Supabase Cron: Vercel Hobby cron jobs can only run once per day
-- (VERIFIED 2026-11-17: https://vercel.com/docs/cron-jobs/usage-and-pricing), but reminders need ~5-minute
-- resolution. Supabase Cron (pg_cron) can run "every second to once a year" and make HTTP requests
-- (VERIFIED 2026-11-17: https://supabase.com/docs/guides/cron). NOT VERIFIED: an explicit statement that
-- pg_cron/pg_net are available on the Free plan — confirm in Dashboard → Integrations → Cron.
--
-- 1. Enable extensions: Dashboard → Database → Extensions → enable "pg_cron" and "pg_net".
-- 2. Store the secrets in Vault (never paste them into a cron command):
select vault.create_secret('https://YOUR-APP.vercel.app', 'app_url');
select vault.create_secret('PASTE_THE_SAME_VALUE_AS_CRON_SECRET', 'cron_secret');

-- 3. Every 5 minutes: reminders & messages
select cron.schedule('shake-shake-dispatch', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 30000
  );
$$);

-- 4. Daily at 03:10 IST (21:40 UTC): photo retention
select cron.schedule('shake-shake-retention', '40 21 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/retention',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 60000
  );
$$);

-- Inspect runs:  select * from cron.job_run_details order by start_time desc limit 20;
-- Remove:        select cron.unschedule('shake-shake-dispatch');
