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

## Proposed by Claude — need owner OK

| ID | Proposal | Status | Rationale |
|---|---|---|---|
| D-014 | AI returns ingredients in grams; **app computes macros from USDA FoodData Central (CC0)**; unmatched → "AI estimate" badge | PROPOSED | Prevents hallucinated nutrition numbers; traceable source. |
| D-015 | Leaderboard scoring: move % (cap 200) + protein % (cap 100) + logging & streak pts (max 50), daily max 350; weekly reset Mon 00:00 IST; goals locked per week | PROPOSED | Fair across body sizes, rewards app purpose, resists gaming. |
| D-017 | Per-user AI quota default 15 calls/day + global circuit breaker | PROPOSED | Keeps within unpublished free-tier limits; tune after reading AI Studio limits. |
| D-018 | Push cap 4/day, quiet hours 22:00–07:00 | PROPOSED | Avoid notification fatigue; iOS users can revoke easily. |
| D-019 | Photo retention: originals deleted after 90 days, thumbnails kept | PROPOSED | Stays inside 1 GB free storage. |
| D-020 | Auth: email OTP / magic link (no passwords, no social login initially) | PROPOSED | Simplest secure default on Supabase; Google sign-in can come later. |

## Open questions

| ID | Question | Owner | Needed by |
|---|---|---|---|
| O-001 | May IFCT 2017 (© NIN) values be embedded in the app? If yes, prefer it for Indian ingredients; else USDA FDC only. | Mani (ask NIN / check licence) | M2 |
| O-002 | Do Gemini API terms allow the free tier for users outside India (EEA/UK/CH)? | Claude Code to check Gemini API Additional Terms | Before inviting non-India users |
| O-003 | Exact current free-tier model + RPD/RPM for our project | Claude Code (AI Studio) | M1 |
| O-004 | Does Supabase free plan include scheduled jobs (pg_cron / scheduled Edge Functions) we need for reminders? | Claude Code (Supabase docs) | M1 |
| O-005 | Trademark check: "Shake Shake" vs "Shake Shack" | Mani | Before public launch |
| O-006 | Her usual meal times, cooking time available, spice level, dislikes/allergies (captured in onboarding, but useful for testing) | Mani | M1 test data |
| O-007 | Does she prefer Tamil/Kerala/Andhra/Karnataka styles, or a mix? | Mani | M2 prompt tuning |
| O-008 | Should Mani have a special "partner" role (e.g. send custom love notes into her message centre)? | Mani | M4 |
| O-009 | Privacy notice + DPDP compliance review by a qualified person before public launch | Mani | Before public launch |
| O-010 | Oura data fields for active/total calories and membership requirement for her ring generation | Claude Code (Oura OpenAPI) | Phase 2 |
