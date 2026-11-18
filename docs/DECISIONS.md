# Decision Log — Shake Shake

*Format: ID · Decision · Status · Date · Rationale · Consequences. Statuses: APPROVED (owner) · PROPOSED (needs owner OK) · OPEN (question).*
*Rule for Claude Code: never change an APPROVED decision silently — add a new entry that supersedes it.*

## Approved by owner (brainstorm 2026-11-17)

| ID | Decision | Status | Rationale / consequences |
|---|---|---|---|
| D-001 | Primary diet: **non-vegetarian** South Indian (veg dishes also offered) | APPROVED | Seafood, chicken, mutton, egg broaden protein options. Diet type is a per-user setting for friends. |
| D-002 | Audience: **open to anyone**, launched **public-ready, invite-only** | APPROVED | Production-grade auth/consent/RLS now; public sign-up gated until moderation & quota protection are proven. |
| D-003 | Calorie burn: **manual entry first**, Oura auto-sync in **phase 2** | APPROVED | Oura API is OAuth2-only (PATs deprecated Dec 2025) and limited to 10 users before Oura approval — fine for phase 2 with a small circle. |
| D-004 | Stack: **Next.js PWA + Supabase free + Gemini free tier + Web Push + Vercel Hobby** | APPROVED | $0. Vercel Hobby is non-commercial only → if monetised, re-decide hosting. |
| D-005 | Tone: romantic + humour + motivation, **no persona, no voice/audio — text only**, same library for everyone | APPROVED | See TONE_AND_COPY. |
| D-006 | Region: **India** | APPROVED | Indian ingredients/units, IST defaults, DPDP Act 2023 + Rules 2025 apply. |
| D-007 | Targets: **app suggests from a standard formula** (editable) | APPROVED | Mifflin-St Jeor + activity factor; protein g/kg ranges anchored on ICMR-NIN 2020 RDA floor. |
| D-008 | Budget: **$0/month** | APPROVED | Every paid dependency is out of scope unless a new decision approves it. |
| D-009 | Primary device: **iPhone** | APPROVED | Add-to-Home-Screen onboarding is mandatory for push reminders. |
| D-010 | Recipes: **fully AI-generated** | APPROVED | Mitigated by D-014 (app computes nutrition). |
| D-011 | Photo AI: **use Gemini free tier with clear, separate, revocable consent** | APPROVED | Free-tier data may be used by Google to improve products; manual path always available. |
| D-012 | Leaderboard: **follow industry best practice** | APPROVED | Implemented as %-of-own-goal points with caps (Apple Activity-competition pattern) — see PRODUCT_BRIEF §7. |
| D-013 | Feed default: friends see **everything incl. calories & protein** | APPROVED | Requires `social_sharing` consent at onboarding; per-meal "make private" toggle still offered (privacy by design). Health profile (weight, allergies) is never shared. |
| D-016 | App name: **Shake Shake** | APPROVED | Trademark check before public launch (O-005). |

## Proposed by Claude — approved by owner 2026-11-17

| ID | Proposal | Status | Rationale |
|---|---|---|---|
| D-014 | AI returns ingredients in grams; **app computes macros from USDA FoodData Central (CC0)**; unmatched → "AI estimate" badge | APPROVED (owner, 2026-11-17) | Prevents hallucinated nutrition numbers; traceable source. |
| D-015 | Leaderboard scoring: move % (cap 200) + protein % (cap 100) + logging & streak pts (max 50), daily max 350; weekly reset Mon 00:00 IST; goals locked per week | APPROVED (owner, 2026-11-17) | Fair across body sizes, rewards app purpose, resists gaming. |
| D-017 | Per-user AI quota default 15 calls/day + global circuit breaker | APPROVED (owner, 2026-11-17) | Keeps within unpublished free-tier limits; tune after reading AI Studio limits. |
| D-018 | Push cap 4/day, quiet hours 22:00–07:00 | APPROVED (owner, 2026-11-17) | Avoid notification fatigue; iOS users can revoke easily. |
| D-019 | Photo retention: originals deleted after 90 days, thumbnails kept | APPROVED (owner, 2026-11-17) | Stays inside 1 GB free storage. |
| D-020 | Auth: email OTP / magic link (no passwords, no social login initially) | APPROVED (owner, 2026-11-17) | Simplest secure default on Supabase; Google sign-in can come later. |

## Build-time decisions (Claude Code, 2026-11-17) — approved by owner 2026-11-17

| ID | Decision | Status | Rationale / evidence |
|---|---|---|---|
| D-021 | **Scheduler = Supabase Cron (pg_cron + pg_net) → `POST /api/cron/dispatch` every 5 min**, authenticated with `CRON_SECRET`; messages are picked and pushed from the Next.js server (web-push). Daily retention job the same way. | APPROVED (owner, 2026-11-17) | Vercel Hobby cron runs **once per day only** (VERIFIED: vercel.com/docs/cron-jobs/usage-and-pricing, 2026-11-17) — too coarse for plate reminders. Supabase Cron runs every second → yearly and can make HTTP requests (VERIFIED: supabase.com/docs/guides/cron). Keeps one runtime (Node) instead of a second Deno code base. Free-plan availability of pg_cron/pg_net: NOT VERIFIED explicitly — confirm in dashboard. |
| D-022 | `recomposition` goal uses TDEE × 0.90–1.00 | APPROVED (owner, 2026-11-17) | NUTRITION_RULES §2.1 defines lose/maintain/gain only. Mild deficit is a common recomposition approach — confirm with a dietitian. |
| D-023 | `birth_year`, `sex`, `height_cm` moved from `profiles` to owner-only `health_profile` | APPROVED (owner, 2026-11-17) | Friends can read `profiles` (name, avatar). RLS is row-level, so body data in that row would leak. Implements D-013 "health profile is never shared". |
| D-024 | Revoking `health_data` consent deletes the health profile; revoking push deletes push subscriptions | APPROVED (owner, 2026-11-17) | Purpose limitation / DPDP. Targets are kept (needed for history) — legal review O-009 should confirm. |
| D-025 | Next.js **16.4** with Cache Components (scaffold default): pages stream session-dependent content inside `<Suspense>`; auth refresh in `src/proxy.ts` (Next 16 renamed middleware → proxy) | APPROVED (owner, 2026-11-17) | Follows bundled docs `node_modules/next/dist/docs` (authentication-with-cache-components, proxy). |
| D-026 | Supabase keys use current names: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (supersede ANON/SERVICE_ROLE names in the original `.env.example`) | APPROVED (owner, 2026-11-17) | VERIFIED: Supabase SSR guide for Next.js (2026-11-17). Session checks use `getClaims()` (verifies JWT), never `getSession()` server-side. |
| D-027 | Redeeming an invite creates the profile and an **accepted friendship with the inviter**; strangers connect via an 8-char friend code (no user directory) | APPROVED (owner, 2026-11-17) | Fewer steps for invitees; no searchable user list (privacy, anti-abuse). |
| D-028 | Nutrition seed = USDA FDC **SR Legacy 2018-04** + **Foundation 2026-10-29** (CC0), auto-matched to a 174-item South Indian catalogue; 163 matched, 11 unmatched (paneer, curry leaves, horse gram, poha, sardine, …); rows imported `reviewed=false` | APPROVED (owner, 2026-11-17) | Generated by `scripts/build-foods.mts`; review `docs/FOODS_IMPORT_REPORT.md`. Unmatched items make recipes "≈ partial" — strong reason to resolve O-001 (IFCT 2017). |
| D-029 | Photo retention deletes the photo after 90 days; **thumbnails not implemented yet** (deviation from D-019) | APPROVED (owner, 2026-11-17) | Keeps within 1 GB. Thumbnail generation would need server image processing — add later if wanted. |
| D-030 | **Sign-in = email → 6-digit code.** The invite code is asked only when the email isn't a member yet (pre-filled from invite links); joining is automatic after the code (no separate welcome step). Requires custom SMTP so the email can contain `{{ .Token }}`; the default link still works as a fallback. | APPROVED (owner request, 2026-11-18) | Owner asked for "email → code → main page". Keeps invite-only (D-002) as the owner chose. |
| D-031 | **Built-in recipe library** (40 recipes: 20 lunch / 20 dinner; non-veg, egg and veg) written by Claude in a Claude Code session, stored in `recipes` (migration 0005), used whenever the live AI is busy, failing, out of quota or switched off. Nutrition computed from USDA FDC like every recipe (all 40 "computed"). Swap reasons (more protein / faster / veg) and recent-dish variety are honoured in the fallback. | APPROVED (owner request, 2026-11-18) | Gemini free tier returned 503 "high demand" repeatedly, so suggestions failed. The owner asked to use their Claude subscription: a consumer Claude/ChatGPT subscription can't be called by the app (API access is billed separately — DOCUMENTED, vendor help pages, not re-checked this session), so the subscription was used to author the library instead. Refines D-010 (recipes still AI-written, partly pre-generated). $0. A paid Claude API backup (Claude Haiku 5.5, ≈ $0.0007/suggestion — ESTIMATE from $0.10/$0.50 per MTok × ~800 in / ~1,200 out tokens) remains an option needing a D-008 budget change. |

## Open questions

| ID | Question | Owner | Needed by |
|---|---|---|---|
| O-001 | May IFCT 2017 (© NIN) values be embedded in the app? If yes, prefer it for Indian ingredients; else USDA FDC only. | Mani (ask NIN / check licence) | M2 |
| O-002 | Do Gemini API terms allow the free tier for users outside India (EEA/UK/CH)? | Claude Code to check Gemini API Additional Terms | Before inviting non-India users |
| O-003 | Exact current free-tier model + RPD/RPM for our project | **Mani** — NOT VERIFIED by Claude Code: Gemini docs now redirect to aistudio.google.com (blocked in the build environment) and limits are per-project in AI Studio. Set `GEMINI_MODEL` and `AI_GLOBAL_DAILY_CAP` from what AI Studio shows. | Before enabling AI |
| O-004 | Does Supabase free plan include scheduled jobs (pg_cron / scheduled Edge Functions) we need for reminders? | **Partly answered** (D-021): Supabase Cron exists and can call HTTP endpoints; pricing page lists Cron as a module with no plan restriction stated. Confirm in your Free project dashboard. | Before launch |
| O-005 | Trademark check: "Shake Shake" vs "Shake Shack" | Mani | Before public launch |
| O-006 | Her usual meal times, cooking time available, spice level, dislikes/allergies (captured in onboarding, but useful for testing) | Mani | M1 test data |
| O-007 | Does she prefer Tamil/Kerala/Andhra/Karnataka styles, or a mix? | Mani | M2 prompt tuning |
| O-008 | Should Mani have a special "partner" role (e.g. send custom love notes into her message centre)? | Mani | M4 |
| O-009 | Privacy notice + DPDP compliance review by a qualified person before public launch | Mani | Before public launch |
| O-010 | Oura data fields for active/total calories and membership requirement for her ring generation | Claude Code (Oura OpenAPI) | Phase 2 |
