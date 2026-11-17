# Shake Shake 🍳

*The only shake you need is the one you give the pan.*

A mobile-first PWA (iPhone Home Screen) for protein-rich South Indian meals: AI suggestions and swaps, a weekly plan with an auto grocery list, plate-photo logging with a correctable AI estimate, intake vs. burn, and a fair friends leaderboard — with romantic, funny, kind nudges.

Read **CLAUDE.md** first, then `docs/`. Setup and operations: **docs/RUNBOOK.md**.

## Stack (DECISIONS D-004, D-021, D-025)
Next.js 16 (App Router, TypeScript strict, Tailwind 4) · Supabase Free (Auth email OTP, Postgres + RLS, Storage, Cron) · Gemini API free tier via `@google/genai` · Web Push (VAPID) · Vercel Hobby · USDA FoodData Central (CC0).

## Develop
```bash
npm install
cp .env.example .env.local   # fill in values — see docs/RUNBOOK.md §1
npm run dev
```

| Command | What it does |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest: nutrition, targets, matching, allergy filter, grocery, leaderboard, message engine, AI gateway, **RLS tests on real Postgres (PGlite)** |
| `npm run test:e2e` | Playwright at 375 px and 430 px (core-loop test runs only with `E2E_*` env vars — see `e2e/core-loop.spec.ts`) |
| `npm run build` | Production build |
| `npm run gen:messages` | Regenerate the message library from `docs/TONE_AND_COPY.md` |
| `npm run gen:foods -- <sr_legacy.json> <foundation.json>` | Regenerate the foods seed from USDA FDC downloads |

## Layout
```
src/app/            routes (public: /, /login, /invite/[code], /privacy · app: /today /plan /log /dashboard /feed /friends /leaderboard /grocery /inbox /settings /admin /recipe/[id])
src/app/actions/    server actions (auth, onboarding, meals, log, social, settings)
src/app/api/        cron/dispatch · cron/retention · account/export
src/lib/ai/         single AI gateway: consent → quota → structured output → zod → fallback
src/lib/nutrition/  targets, matching, nutrition compute, allergy filter, grocery, balance
src/lib/leaderboard src/lib/messages   scoring (D-015) · message engine (caps, quiet hours, no-repeat)
src/lib/server/     data access layer, meal generation, scoring, dispatcher (server-only)
supabase/           migrations (schema + RLS, storage, messages seed, foods seed) · cron.sql
tests/              RLS harness + tests, fixtures (synthetic numbers — never used by the app)
```

## Honesty notes
- Nutrition numbers come from USDA FDC; anything not matched is badged "≈" or "AI estimate".
- Photo estimates are approximate and always need the user's confirmation; accuracy hasn't been measured yet (M3-07).
- Not medical advice. See `/privacy`.
