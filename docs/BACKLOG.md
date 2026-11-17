# Backlog — Shake Shake

*Status legend: TODO · DOING · DONE · BLOCKED · **BUILT** (code complete and unit/RLS-tested in the build environment, but NOT yet verified against a live Supabase project, Gemini key or a real iPhone) · **PARTIAL** (see note). Each story ID is referenced in commits/PRs. Order = build order.*

*Status as of 2026-11-17 (first build session). Evidence: `npm test` = 70 tests (49 logic + 21 RLS on PGlite), `npm run test:e2e` public suite at 375/430 px, `npm run build` passes.*

## M0 — Foundations
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M0-01 | Repo scaffold: Next.js (App Router, TS strict), Tailwind, ESLint/Prettier, Vitest, Playwright | `npm run lint/typecheck/test` pass; README with setup | DONE |
| M0-02 | Supabase project + local dev (CLI), migrations folder, typed client | Migration applies cleanly; generated DB types committed | PARTIAL — migrations apply cleanly (proved on PGlite); generated DB types NOT done (needs `supabase gen types` against a real project) |
| M0-03 | PWA basics: manifest, icons, service worker, standalone display, iOS meta tags | Installs to iPhone Home Screen, opens standalone with splash/icon | BUILT — manifest/icons/SW/iOS meta; Home Screen install not tested on a real iPhone |
| M0-04 | Env & secrets layout (`.env.example`), server-only modules guarded | No secret referenced in client bundle (build check) | DONE — CI greps client bundle; 0 hits |
| M0-05 | Verify open items O-003, O-004 and record answers in DECISIONS | Entries updated with links | PARTIAL — O-004 partly answered; O-003 NOT VERIFIED (owner to check AI Studio) |

## M1 — Profile, targets, consent
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M1-01 | Email OTP / magic-link sign-in; invite-code gate | Only valid invite codes can create accounts; codes expire/limit uses | BUILT — invite gate tested in RLS suite |
| M1-02 | Profile: name, avatar upload (compressed) or illustrated avatar | Avatar ≤ 100 KB stored privately; shown in header | PARTIAL — illustrated avatar presets done; photo-avatar upload not built (compression + bucket ready) |
| M1-03 | Health profile & goals onboarding | Fields per ARCHITECTURE §5; medical-flag question per NUTRITION_RULES §2.2 | BUILT |
| M1-04 | Target suggestion engine | Unit tests for Mifflin-St Jeor, activity factors, −5 % option, BMR floor, protein ranges; source line shown | DONE — unit tests |
| M1-05 | Consent centre (health data, AI processing, social sharing, push) | Separate toggles, versioned, revocable; AI features disabled when revoked | BUILT — append-only consents; RLS gating tested |
| M1-06 | Add-to-Home-Screen guide + push opt-in button (iOS) | Detects non-standalone Safari; permission only on tap; subscription stored | BUILT — not tested on iPhone |
| M1-07 | RLS policies + tests for all M1 tables | Tests prove cross-user reads/writes are denied | DONE — RLS tests (PGlite) |

## M2 — Meals: suggest, swap, choose
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M2-01 | Import curated USDA FDC subset (South Indian ingredient list + aliases) into `foods` | ≥ 150 ingredients; source/release recorded; alias table | PARTIAL — 163/174 matched from FDC, rows `reviewed=false` awaiting human review; 11 unmatched (incl. paneer) |
| M2-02 | AI gateway (`lib/ai/`): consent → quota → structured output → zod → fallback | 429 and invalid JSON handled; usage logged in `ai_usage` | DONE — unit tests (fake provider); live Gemini NOT tested |
| M2-03 | Lunch & dinner suggestion cards on Home | Protein, kcal (with nutrition_status badge), cook time, "why" line | BUILT |
| M2-04 | Nutrition recompute from `foods` | Matches NUTRITION_RULES §3 thresholds; unit tests with fixture recipes | DONE — unit tests |
| M2-05 | Allergy & dislike hard filter | Recipe containing a declared allergen is never shown (test) | DONE — unit tests |
| M2-06 | Swap flow with reasons (more protein / faster / different protein / veg) | 3 alternatives; cached; tone copy from `swap` | BUILT |
| M2-07 | Recipe detail view (ingredients, steps, per-serving macros, source line) | Readable on 375 px width | BUILT |
| M2-08 | Choose meal → `meal_plan_slots` + schedule plate reminder | Reminder fires at meal time + 30 min (configurable) | BUILT |

## M3 — Log the plate & balance
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M3-01 | Camera/photo upload with client compression + EXIF strip | Output ≤ ~150 KB, ≤ 1080 px; no GPS metadata in stored file | BUILT — canvas re-encode strips EXIF; not tested on iPhone |
| M3-02 | AI plate estimate (range + confidence) | Uses chosen recipe if present; shows range | BUILT |
| M3-03 | Confirm / correct (portion slider, edit dish/numbers) | Both AI estimate and final values stored | BUILT |
| M3-04 | Manual meal log (no photo / no AI) | Works with AI consent off | BUILT — e2e test written, needs Supabase to run |
| M3-05 | Manual burn entry (active kcal; optional total) | One-tap daily entry; edit history | BUILT — edit history via trigger |
| M3-06 | Daily dashboard: intake vs target, protein vs target, burn, net, 7-day trend | Labels show "estimated" where applicable | BUILT |
| M3-07 | Accuracy evaluation harness: 30+ labelled South Indian plates | Report mean abs. error for kcal/protein; documented in DECISIONS | TODO — needs 30+ labelled plates |

## M4 — Weekly plan & groceries
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M4-01 | Generate 7-day lunch+dinner plan respecting targets, variety, dislikes | No dish repeated > 2×/week (configurable); each slot swappable | BUILT |
| M4-02 | Grocery list aggregation (grams → shoppable units, aisle grouping) | Staples toggle; check-off persists | DONE (aggregation unit-tested) / BUILT (UI) |
| M4-03 | Share list (Web Share API → WhatsApp etc.) with copy fallback | Works on iOS Safari standalone | BUILT |

## M5 — Social & motivation
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M5-01 | Invites & friendships (request/accept/block) | Blocked users can't see each other | BUILT — block/visibility RLS-tested |
| M5-02 | Friends feed (photo, dish, kcal, protein) + per-meal private toggle | Respects consent + visibility (RLS test) | BUILT — RLS-tested |
| M5-03 | Reactions + short comments; report & hide | Reports land in owner moderation queue | BUILT — report RLS-tested |
| M5-04 | Leaderboard (weekly, D-015 scoring) | Unit tests for caps, goal lock, flags | DONE (scoring unit-tested) / BUILT (UI) |
| M5-05 | Message engine: triggers, caps, quiet hours, no-repeat 21 days | Respects TONE_AND_COPY §3; message centre fallback | DONE (engine unit-tested) / BUILT (dispatcher) |
| M5-06 | Owner admin: invites, moderation queue, AI usage view | Admin-only via role claim | BUILT |

## M6 — Privacy, hardening, launch (invite-only)
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M6-01 | Data export (JSON) + account deletion cascade incl. storage | Deletion verified by test | BUILT — deletion not run against live Storage |
| M6-02 | Privacy notice + "not medical advice" + AI data-use disclosure | Linked from onboarding & settings | BUILT — DRAFT notice, needs legal review (O-009) |
| M6-03 | Backup runbook (manual logical export) + restore-from-pause runbook | Documented in `docs/RUNBOOK.md` | DONE — docs/RUNBOOK.md |
| M6-04 | Release checklist run (skill) on iPhone | All items pass or are logged as known issues | TODO — run on a real iPhone after deployment |

## Phase 2 (later)
| ID | Story |
|---|---|
| P2-01 | Oura OAuth connect + daily activity sync (Edge Function), "synced" badge |
| P2-02 | Personalisation from meal history (likes/swaps) |
| P2-03 | Challenges (protein week, seafood week) |
| P2-04 | Tone setting (romantic / playful / coach) |
| P2-05 | Open public sign-up (after O-002, O-005, O-009 resolved) |
