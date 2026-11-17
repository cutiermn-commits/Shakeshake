# Architecture — Shake Shake

*Status: v0.1 · 2026-11-17 · Classification legend: **VERIFIED** (official source, linked) · **DOCUMENTED** (credible secondary) · **ASSUMPTION** · **ESTIMATE** · **NOT VERIFIED***

## 1. Architecture principles applied

Fit-to-standard (Supabase/Next.js built-ins) · configuration before code · single AI gateway · deny-by-default security (RLS) · clear system of record per entity · privacy by design · $0 TCO · graceful degradation when AI/quota unavailable.

## 2. Context diagram

```
 iPhone (Home Screen PWA)
   │  HTTPS
   ▼
 Next.js app (Vercel Hobby) ──── Route Handlers / Server Actions
   │            │                        │
   │            │                        ├──► Gemini API (free tier)  [recipes, swaps, plate estimate]
   │            │                        └──► USDA FDC data (local table, imported once)
   ▼            ▼
 Supabase (free): Auth · Postgres + RLS · Storage (photos/avatars) · Edge Functions + scheduled jobs
   │
   └──► Web Push services (Apple / FCM / Mozilla endpoints) via VAPID   [reminders, nudges]

 Phase 2: Oura API v2 (OAuth2) ──► Edge Function sync ──► activity_logs
```

## 3. Components

| Component | Responsibility | Tech |
|---|---|---|
| PWA shell | UI, offline shell, camera upload, image compression, push subscription | Next.js App Router, Tailwind, service worker, web manifest |
| AI gateway (`src/lib/ai/`) | Consent check → quota → prompt → structured output → zod validation → nutrition recompute → cache | Server-only TS module |
| Nutrition engine (`src/lib/nutrition/`) | Ingredient matching, macro computation, targets formulas, unit conversion for grocery list | Pure TS, unit-tested |
| Scheduler | Meal-photo reminders, morning nudges, weekly plan prompt, photo retention | Supabase Cron → `POST /api/cron/*` (Next.js route) → Web Push (D-021) |
| Social | Invites, friendships, feed, reactions, comments, reports | Postgres + RLS (+ Supabase Realtime optional) |
| Privacy centre | Consents, export (JSON), delete account, data-sharing toggles | Server actions + Edge Function for cascade delete incl. storage |

## 4. Systems of record

| Data | System of record |
|---|---|
| Identity / auth | Supabase Auth |
| Profile, targets, consents | Postgres `profiles`, `targets`, `consents` |
| Recipes (AI-generated, cached) | Postgres `recipes` (+ `recipe_ingredients`) |
| Nutrition reference | Postgres `foods` (imported from USDA FDC, CC0) |
| Meal plan / logs | Postgres `meal_plans`, `meal_plan_slots`, `meal_logs` |
| Photos, avatars | Supabase Storage (private buckets, signed URLs) |
| Burn | Postgres `activity_logs` (source = manual \| oura) |
| Raw Oura data | **Oura** remains system of record; we store only daily summary fields we need (phase 2) |

## 5. Data model (initial)

```
profiles(id PK=auth.uid, display_name, avatar_path, city, birth_year, sex, height_cm, timezone, diet_type, spice_level, created_at)
health_profile(user_id PK, weight_kg, activity_level, goal, allergies[], dislikes[], updated_at)      -- sensitive
targets(user_id, effective_from, kcal_min, kcal_max, protein_g_min, protein_g_max, active_kcal_goal, method, source_note, user_overridden bool)
consents(user_id, purpose[health_data|ai_processing|social_sharing|marketing_push], granted bool, version, granted_at, revoked_at)
foods(id, fdc_id, name, aliases[], kcal_per_100g, protein_g, fat_g, carb_g, fibre_g, source='USDA FDC', source_release)
recipes(id, title, cuisine_region, meal_type[lunch|dinner], diet_type, servings, cook_minutes, steps jsonb, ai_model, prompt_version, created_by, nutrition_status[computed|partial|ai_estimate], per_serving_kcal, per_serving_protein_g)
recipe_ingredients(recipe_id, food_id NULL, raw_name, grams, matched bool)
meal_plans(id, user_id, week_start)
meal_plan_slots(plan_id, date, meal_type, recipe_id, status[planned|chosen|swapped|skipped])
meal_logs(id, user_id, date, meal_type, recipe_id NULL, photo_path NULL, ai_estimate jsonb, kcal, protein_g, source[ai|ai_corrected|manual|recipe], visibility[friends|private], created_at)
activity_logs(user_id, date, active_kcal, total_kcal NULL, source[manual|oura], flagged bool)
grocery_lists(id, user_id, week_start) · grocery_items(list_id, food_id, name, qty, unit, aisle, is_staple, checked)
friendships(user_id, friend_id, status[pending|accepted|blocked]) · invites(code, inviter_id, expires_at, max_uses, uses)
reactions(log_id, user_id, emoji) · comments(log_id, user_id, body, hidden bool) · reports(target_type, target_id, reporter_id, reason, status)
leaderboard_daily(user_id, date, move_pts, protein_pts, logging_pts, total)   -- materialised by job
messages(id, category, trigger, text, tone_tags[], active)  · message_sends(user_id, message_id, sent_at)
push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, created_at)
ai_usage(user_id, date, calls, kind)
```

**RLS sketch:** owner full access to own rows; friends (accepted) can `select` `meal_logs` where `visibility='friends'` AND owner has `social_sharing` consent; `health_profile` and `targets` are owner-only; `foods` and `messages` are read-only for authenticated users; writes to `leaderboard_daily` only by service role.

## 6. AI pipeline

### 6.1 Recipe / swap / weekly plan
1. Build prompt from profile (diet, dislikes, allergies, spice, cook time), targets, recent meals (variety), meal type, swap reason.
2. Request **structured JSON output** (title, region, servings, ingredients[{name, grams}], steps[], cook_minutes, protein_tip).
3. Validate with zod; reject/retry once; else fall back to cached recipe from `recipes` matching constraints.
4. **Recompute nutrition** from `foods` (see NUTRITION_RULES). If some ingredients don't match → `nutrition_status=partial`, show "≈ AI estimate" badge.
5. **Allergy hard filter**: reject any recipe containing a declared allergen (string + alias match) even if the AI says it's safe.
6. Cache in `recipes` so repeats cost zero quota.

### 6.2 Plate photo estimate
1. Consent `ai_processing` required. Client compresses + strips EXIF.
2. Send image + context (chosen recipe if any, plate/bowl hint) → structured output: dish guess, components with estimated grams, kcal range, protein range, confidence, notes.
3. If a chosen recipe exists, prefer recipe-based macros scaled by estimated portion.
4. Show **range + confidence**, require one-tap confirm or correction. Store both AI estimate and final values.
5. *ASSUMPTION:* photo-based estimation is approximate; accuracy has **not** been measured for South Indian dishes. Plan an evaluation (BACKLOG M3-07).

### 6.3 Quotas & failure
- Per-user daily AI budget (config, default ASSUMPTION: 15 calls/day) + global daily circuit breaker.
- On 429/quota exceeded: friendly message + manual path; never block logging.
- **Free-tier limits are not fixed in docs** — Google shows them per project in AI Studio. Read them before launch and set config accordingly.

## 7. Notifications (iOS)

- **VERIFIED:** iOS/iPadOS 16.4+ supports Web Push for Home Screen web apps; permission must be requested in response to direct user interaction. Source: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Onboarding detects iOS Safari not in standalone mode → shows Add-to-Home-Screen guide.
- In-app message centre as fallback when push isn't enabled.
- Frequency caps (ASSUMPTION, tune with user): ≤ 4 pushes/day, quiet hours 22:00–07:00 local, per-category opt-out.

## 8. Evidence register

| # | Claim | Class | Source |
|---|---|---|---|
| E1 | Gemini API free tier exists; free-tier data "Used to improve our products: Yes", paid "No" | VERIFIED | https://ai.google.dev/gemini-api/docs/pricing |
| E2 | Free-tier per-model RPM/RPD not published as fixed numbers; view in AI Studio | DOCUMENTED | ai.google.dev rate-limits page via secondary summaries (2026) — re-check |
| E3 | Supabase Free: 500 MB DB, 1 GB file storage, 5 GB egress, 50k MAU, 2 projects, pauses after 1 week inactivity | VERIFIED 2026-11-17 | https://supabase.com/pricing |
| E4 | Vercel Hobby restricted to non-commercial personal use | VERIFIED | https://vercel.com/docs/plans/hobby |
| E5 | iOS 16.4+ Web Push for Home Screen web apps, user-gesture permission | VERIFIED | webkit.org (above) |
| E6 | Oura API v2: OAuth2 only; personal access tokens deprecated Dec 2025; apps limited to 10 users before Oura approval | VERIFIED | Oura OpenAPI spec: https://cloud.ouraring.com/v2/docs |
| E7 | Oura Gen3+ users need active membership for API access | DOCUMENTED | Terra blog (Sept 2026) citing Oura — re-check |
| E8 | USDA FoodData Central is public domain, CC0 1.0 | VERIFIED | https://fdc.nal.usda.gov/ |
| E9 | IFCT 2017: 528 raw foods, © NIN, no composite dishes, NIN gives no warranty | VERIFIED (content) / NOT VERIFIED (licence to embed) | https://www.nin.res.in/ebooks/IFCT2017.pdf |
| E10 | DPDP Rules 2025 notified Nov 2025; phased dates 14 Nov 2025, 14 Nov 2026, 14 May 2027 | DOCUMENTED | Law-firm summaries (AMSS, AZB) + PIB — confirm with counsel |
| E11 | Apple Activity Competitions: 1 point per % of rings, max 600/day | DOCUMENTED | Secondary sources quoting Apple support |
| E12 | Gemini free tier usable for end users in India; restrictions for EEA/UK/CH users | NOT VERIFIED | Check Gemini API Additional Terms before inviting users outside India |
| E13 | Oura `daily_activity` exposes active/total calories fields | NOT VERIFIED | Check OpenAPI spec before phase 2 |
| E14 | Vercel Hobby cron: max once per day, ±59 min precision | VERIFIED 2026-11-17 | https://vercel.com/docs/cron-jobs/usage-and-pricing |
| E15 | Supabase Cron (pg_cron) schedules SQL or HTTP requests (e.g. invoking functions), every second → yearly | VERIFIED 2026-11-17 | https://supabase.com/docs/guides/cron |
| E16 | Supabase Edge Functions Free plan: 150 s wall clock, 2 s CPU, 100 functions | VERIFIED 2026-11-17 | https://supabase.com/docs/guides/functions/limits |
| E17 | Supabase SSR for Next.js: `@supabase/ssr`, publishable key, proxy refresh via `getClaims()`; never trust `getSession()` on the server | VERIFIED 2026-11-17 | https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs |
| E18 | Gemini JS SDK `@google/genai` 3.4: `generateContent` config supports `responseMimeType` + `responseJsonSchema`; errors are `ApiError` with HTTP `status` | VERIFIED (installed package type definitions) | node_modules/@google/genai/dist/genai.d.ts |
| E19 | USDA FDC datasets used: SR Legacy 2018-04 JSON (sha256 0fe8ae48…), Foundation 2026-10-29 JSON (sha256 dd414cc9…) | VERIFIED | https://fdc.nal.usda.gov/download-datasets |
| E20 | Gemini free-tier models/limits for this project | NOT VERIFIED | Docs moved to aistudio.google.com (not reachable from build env) — owner to check AI Studio (O-003) |

## 9. Alternatives considered

| Decision | Chosen | Alternatives | Why chosen |
|---|---|---|---|
| Backend | Supabase free | Firebase Spark; Neon + custom auth; PocketBase self-host | Auth + Postgres + Storage + RLS in one free tier; SQL suits reporting/leaderboards. Firebase also viable (NOT VERIFIED free storage terms). |
| AI | Gemini free tier | Claude/OpenAI (paid only → violates C1); on-device models (too weak/heavy for iPhone browser) | Only $0 multimodal option found; consent mitigates training-use risk |
| Recipes | AI-generated + computed nutrition | Curated library; AI-only numbers | Owner chose AI-generated for variety; recompute keeps numbers traceable |
| App type | PWA | Native iOS (needs paid Apple developer account → violates C1); React Native | $0, single codebase, iOS push supported in Home Screen mode |
| Hosting | Vercel Hobby | Cloudflare Pages/Workers, Netlify free | Best Next.js fit; non-commercial clause acceptable for a personal app (NOT VERIFIED alternatives' current terms) |

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Photo calorie estimates inaccurate | Wrong balance, loss of trust | Ranges + confidence, mandatory confirm, prefer recipe macros, accuracy eval set |
| AI invents nutrition / unsafe content | Health harm | Recompute from FDC, allergy hard filter, schema validation, "not medical advice" |
| Free AI quota cut or terms change | Feature outage | Quota config, caching, manual fallback, abstraction allowing provider swap |
| Free-tier training use of photos | Privacy | Explicit opt-in, plain-language notice, revocable; never send faces deliberately — advise plate-only framing |
| Supabase pause after inactivity | App down | Daily real usage keeps it active; documented restore runbook; nightly logical backup export (free plans have no backups — DOCUMENTED) |
| 1 GB storage | Uploads fail | Compression; ESTIMATE: 1 GiB ÷ 150 KB ≈ 6,990 photos ≈ 233 days at 30 photos/day (10 users × 3); retention: keep thumbnail, delete originals > 90 days (configurable) |
| iOS push only when installed | Missed reminders | Install guide, in-app reminder centre, badge |
| Social abuse once public | Harm, compliance | Invite-only, report/hide/block, owner moderation queue, rate limits |
| DPDP compliance | Legal | Consent records, purpose limitation, export/delete, breach runbook, privacy notice; get legal review before public launch |
| Manual-entry cheating on leaderboard | Unfair | %-of-goal scoring, caps, flags, goal lock per week |
