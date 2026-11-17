# Runbook — Shake Shake

*Operational procedures for the owner (Mani). M6-03.*

## 1. First-time setup (≈ 30 minutes, all free tiers)

1. **Supabase** — create a Free project (pick the region closest to India). In *Project Settings → API Keys* copy the **publishable** key and the **secret** key.
2. **Database** — open *SQL Editor → New query*, paste the whole of `supabase/setup.sql` (all migrations in one file) and press **Run**. Expect "Success. No rows returned". Or with the Supabase CLI: `supabase link` then `supabase db push`.
3. **Auth** — *Authentication → Sign In / Providers → Email*: keep email enabled. *Authentication → URL configuration*: Site URL = your Vercel URL; add `https://YOUR-APP.vercel.app/auth/confirm` to Redirect URLs.
   Email template "Magic Link": make sure it includes the 6-digit `{{ .Token }}` (iPhone Home Screen apps can't open magic links in the same window, so the code is the reliable path) and, optionally, a link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
   ⚠️ Supabase's built-in email sender is rate-limited and meant for testing (NOT VERIFIED exact limit — check *Auth → Rate limits*). For more than a few friends, configure a free SMTP provider.
4. **Gemini** — in Google AI Studio, check which Flash-class model your project can use for free and its daily limit (O-003). You'll set `GEMINI_MODEL` and `AI_GLOBAL_DAILY_CAP` from that.
5. **Web Push keys** — run `npx web-push generate-vapid-keys` locally.
6. **Vercel** — import the GitHub repo, add the env vars from `.env.example` (*Settings → Environment Variables*), deploy.
7. **Scheduler** — run `supabase/cron.sql` in the SQL editor (enable `pg_cron` and `pg_net` first). Use a random `CRON_SECRET` of ≥ 32 characters (e.g. `openssl rand -hex 32`) in both Vercel and Vault.
8. **First invite (bootstrap)** — in the SQL editor:
   ```sql
   insert into public.invites (code, inviter_id, expires_at, max_uses) values ('MANI2026', null, now() + interval '7 days', 2);
   ```
   Sign up with that code, then make yourself admin:
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'YOUR@EMAIL';
   ```
   Sign out and in again so the new role is in your token. `/admin` now works and you can create invites from the app.
9. **Review the food table** — read `docs/FOODS_IMPORT_REPORT.md`; fix any poor match and set `reviewed = true`.

## 2. Supabase project paused (Free plan pauses after 1 week of inactivity — VERIFIED supabase.com/pricing)
Symptoms: app shows errors / can't sign in. Fix: Supabase dashboard → project → **Restore project**. Takes a few minutes. Daily use (or the 5-minute cron) normally keeps it active — NOT VERIFIED whether cron traffic alone counts as activity.

## 3. Backups (Free plan has no automatic backups — DOCUMENTED)
Weekly, from a laptop with the Supabase CLI:
```bash
supabase db dump --linked -f backup-$(date +%F).sql
supabase db dump --linked --data-only -f data-$(date +%F).sql
```
Store the files somewhere private (they contain health data). Photos are not included; they are disposable after 90 days by design.

**Restore:** create a new project, run the schema dump, then the data dump; update Vercel env vars.

## 4. AI quota exhausted / Gemini errors
The app degrades automatically: users see a friendly message and saved recipes; manual logging always works. Check `/admin` → "AI calls today". Raise or lower `AI_DAILY_CALLS_PER_USER` / `AI_GLOBAL_DAILY_CAP` in Vercel env vars (redeploy).

## 5. Reminders not arriving
1. `select * from cron.job_run_details order by start_time desc limit 20;` — are runs succeeding?
2. `select * from net._http_response order by created desc limit 20;` — 200 from `/api/cron/dispatch`? 401 means `CRON_SECRET` mismatch.
3. On the iPhone: app must be opened from the Home Screen, iOS ≥ 16.4, reminders turned on in Settings → Reminders.
4. Quiet hours (22:00–07:00) and the 4/day cap route messages to the in-app inbox instead — expected.

## 6. Moderation
Reports appear in `/admin`. "Hide content" hides the post/comment for everyone. To remove a user entirely: Supabase *Authentication → Users → Delete* (cascades all data; photos must be removed from Storage `meal-photos/<user-id>/` and `avatars/<user-id>/`).

## 7. Data breach (DPDP Act 2023 / Rules 2025)
1. Rotate keys: Supabase secret key, Gemini key, VAPID keys, `CRON_SECRET`.
2. Preserve logs (Supabase logs, Vercel logs).
3. Notify affected users and, where required, the Data Protection Board of India — **get legal advice on timelines** (NOT VERIFIED here; O-009).

## 8. User data requests
Users self-serve: *Settings → Download my data* (JSON) and *Delete my account* (removes DB rows and photos).

## 9. Verify RLS against the real project (recommended once)
The RLS tests run on PGlite with a stub of Supabase's `auth`/`storage` schemas (`tests/rls/harness.ts`). After step 2, spot-check with two test accounts that a friend can't see a private meal and a stranger sees nothing.
