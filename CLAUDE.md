# CLAUDE.md — Shake Shake

> Standing instructions for Claude Code. Read this file fully at the start of every session.
> Then read `docs/DECISIONS.md` (what's been decided) and `docs/BACKLOG.md` (what's next).

## 1. What we are building

**Shake Shake** is a mobile-first Progressive Web App (PWA) that helps a protein-focused, fitness-minded
user (primary persona: a 40-year-old woman in India who loves South Indian food) to:

1. Get **AI-suggested, protein-rich South Indian lunch and dinner** recipes (non-veg + veg), and swap any suggestion she doesn't like.
2. Build a **weekly meal plan** and an auto-generated **weekly grocery list**.
3. **Record the chosen meal**, get a **reminder to photograph the actual plate**, and receive an **AI calorie/protein estimate from the photo** that she can correct.
4. Track **intake vs. burn** — burn entered manually now (Oura auto-sync in phase 2).
5. Enjoy a **social layer**: profile + avatar, invite friends, friends' meal feed, a fair leaderboard.
6. Feel loved: **romantic, funny, motivational text messages**, delivered often but never spammy.

The name is a joke on purpose: *"The only shake you need is the one you give the pan."*

Full brief: `docs/PRODUCT_BRIEF.md`. Architecture: `docs/ARCHITECTURE.md`.

## 2. Hard constraints (non-negotiable)

| # | Constraint | Why |
|---|---|---|
| C1 | **Running cost = $0/month.** Free tiers only. | Owner's explicit budget. Never add a paid service, paid API or paid plan without an approved entry in `docs/DECISIONS.md`. |
| C2 | **iPhone-first PWA.** Must work as an iOS Home Screen web app. | Primary user is on iPhone. iOS web push only works after "Add to Home Screen" and on a user tap. |
| C3 | **Public-ready, invite-only at launch.** | Sign-up, consent, privacy, deletion and RLS must be production-grade from day one, even though only invitees can join at first. |
| C4 | **Health data is sensitive.** | India's DPDP Act 2023 + DPDP Rules 2025 apply (full obligations phase in by May 2027). Consent, purpose limitation, deletion and breach handling must be designed in. |
| C5 | **AI free tier may use data to improve Google products.** | Every AI feature that sends user photos/data to Gemini requires explicit, separate, revocable opt-in consent. Manual entry must always work without AI. |
| C6 | **Nutrition numbers must be traceable.** | AI writes recipes; the **app** computes macros from a food-composition table (USDA FoodData Central, CC0). Unmatched ingredients are labelled "AI estimate". See `docs/NUTRITION_RULES.md`. |
| C7 | **Not medical advice.** | The app suggests ranges from published formulas; it never prescribes. Show disclaimer + "talk to a doctor if…" guidance. |

## 3. Tech stack (approved — see DECISIONS D-004)

- **Frontend/app:** Next.js (App Router) + TypeScript (strict) + Tailwind CSS. PWA via a web manifest + service worker.
- **Backend:** Supabase free plan — Postgres, Auth (magic link / email OTP), Storage (photos), Row Level Security, Edge Functions.
- **AI:** Google Gemini API **free tier**, a Flash-class multimodal model. **Model name lives in env config, never hard-coded.** Check Google AI Studio for which models are free and what your project's current limits are before choosing.
- **Push:** standard Web Push (VAPID) via service worker.
- **Hosting:** Vercel Hobby (personal, non-commercial only). If the app is ever monetised → must move plans/hosts (DECISIONS D-004).
- **Nutrition data:** USDA FoodData Central (CC0), imported as a curated local table of ingredients used in South Indian cooking.

Before using ANY third-party API, SDK or library feature: **read its current official docs** (use the `verify-vendor-capability` skill). Free-tier limits change often.

## 4. Engineering rules

1. **Fit-to-standard first:** use Supabase/Next.js built-ins (Auth, RLS, Storage, Route Handlers) before writing custom infrastructure.
2. **Secrets never reach the client.** Gemini key, Supabase service role key and VAPID private key live only in server env / Edge Functions.
3. **RLS on every table**, deny-by-default. Write an RLS test for each table you add.
4. **All AI calls go through one server module** (`lib/ai/`) that enforces: consent check → per-user daily quota → structured-output schema validation (zod) → graceful fallback to manual flow on error/429.
5. **AI output is untrusted input.** Validate against schema; never render AI HTML; never execute AI output.
6. **Images:** compress client-side before upload (target ≤ ~150 KB, long edge ≤ 1080 px, WebP/JPEG), strip EXIF (location!). Supabase free storage is 1 GB total.
7. **Accessibility:** WCAG 2.1 AA basics — contrast, tap targets ≥ 44 px, labels, reduced-motion support.
8. **Mobile performance:** test on iPhone Safari + Home Screen mode. Keep JS bundles lean.
9. **Tests:** unit tests for nutrition math, target formulas, leaderboard scoring, quota logic; RLS tests; one Playwright happy-path for the core loop.
10. **Small PRs / commits**, each tied to a backlog item ID (e.g. `M1-03`).
11. **Update `docs/DECISIONS.md`** whenever you make or change an architectural decision. Never silently change an approved decision.

## 5. Evidence & honesty rules (owner's operating policy)

- Never invent API endpoints, SDK methods, quotas, prices, or nutrition values.
- Label claims in docs/PRs as **VERIFIED** (with link), **ASSUMPTION**, **ESTIMATE** (with method) or **NOT VERIFIED**.
- If a doc and reality disagree, stop and flag it — don't guess.
- Before each milestone is called done, run the `release-checklist` skill and report findings honestly (what was tested, what wasn't).

## 6. Tone of the product

Romantic, funny, motivating — **no named persona, no voice/audio, just text.** Rules and message library: `docs/TONE_AND_COPY.md`. Use the `write-motivation-copy` skill to add messages.
Never shame bodies or food, never "earn your food", never celebrate extreme deficits.

## 7. Where things are

```
CLAUDE.md                  ← you are here
docs/PRODUCT_BRIEF.md      ← what & why, personas, journeys, scope
docs/ARCHITECTURE.md       ← stack, components, data model, AI pipeline, security
docs/DECISIONS.md          ← decision log + open questions (ADR-lite)
docs/NUTRITION_RULES.md    ← targets, macro computation, safety rails
docs/TONE_AND_COPY.md      ← voice rules + seed message library
docs/BACKLOG.md            ← milestones and user stories with acceptance criteria
docs/KICKOFF_PROMPT.md     ← first prompt + accounts to create
.env.example               ← required environment variables
.claude/skills/            ← verify-vendor-capability · ai-recipe-pipeline · write-motivation-copy · release-checklist
```

## 8. Definition of Done (every story)

- Acceptance criteria in `docs/BACKLOG.md` met and demonstrated on iPhone-size viewport.
- Lint, typecheck and tests pass.
- RLS covers any new table; no secrets client-side.
- Consent respected for any AI/data-sharing path.
- Copy follows `docs/TONE_AND_COPY.md`.
- Docs updated (DECISIONS / BACKLOG status).
