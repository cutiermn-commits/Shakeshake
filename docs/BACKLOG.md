# Backlog — Shake Shake

*Status legend: TODO · DOING · DONE · BLOCKED. Each story ID is referenced in commits/PRs. Order = build order.*

## M0 — Foundations
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M0-01 | Repo scaffold: Next.js (App Router, TS strict), Tailwind, ESLint/Prettier, Vitest, Playwright | `npm run lint/typecheck/test` pass; README with setup | TODO |
| M0-02 | Supabase project + local dev (CLI), migrations folder, typed client | Migration applies cleanly; generated DB types committed | TODO |
| M0-03 | PWA basics: manifest, icons, service worker, standalone display, iOS meta tags | Installs to iPhone Home Screen, opens standalone with splash/icon | TODO |
| M0-04 | Env & secrets layout (`.env.example`), server-only modules guarded | No secret referenced in client bundle (build check) | TODO |
| M0-05 | Verify open items O-003, O-004 and record answers in DECISIONS | Entries updated with links | TODO |

## M1 — Profile, targets, consent
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M1-01 | Email OTP / magic-link sign-in; invite-code gate | Only valid invite codes can create accounts; codes expire/limit uses | TODO |
| M1-02 | Profile: name, avatar upload (compressed) or illustrated avatar | Avatar ≤ 100 KB stored privately; shown in header | TODO |
| M1-03 | Health profile & goals onboarding | Fields per ARCHITECTURE §5; medical-flag question per NUTRITION_RULES §2.2 | TODO |
| M1-04 | Target suggestion engine | Unit tests for Mifflin-St Jeor, activity factors, −5 % option, BMR floor, protein ranges; source line shown | TODO |
| M1-05 | Consent centre (health data, AI processing, social sharing, push) | Separate toggles, versioned, revocable; AI features disabled when revoked | TODO |
| M1-06 | Add-to-Home-Screen guide + push opt-in button (iOS) | Detects non-standalone Safari; permission only on tap; subscription stored | TODO |
| M1-07 | RLS policies + tests for all M1 tables | Tests prove cross-user reads/writes are denied | TODO |

## M2 — Meals: suggest, swap, choose
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M2-01 | Import curated USDA FDC subset (South Indian ingredient list + aliases) into `foods` | ≥ 150 ingredients; source/release recorded; alias table | TODO |
| M2-02 | AI gateway (`lib/ai/`): consent → quota → structured output → zod → fallback | 429 and invalid JSON handled; usage logged in `ai_usage` | TODO |
| M2-03 | Lunch & dinner suggestion cards on Home | Protein, kcal (with nutrition_status badge), cook time, "why" line | TODO |
| M2-04 | Nutrition recompute from `foods` | Matches NUTRITION_RULES §3 thresholds; unit tests with fixture recipes | TODO |
| M2-05 | Allergy & dislike hard filter | Recipe containing a declared allergen is never shown (test) | TODO |
| M2-06 | Swap flow with reasons (more protein / faster / different protein / veg) | 3 alternatives; cached; tone copy from `swap` | TODO |
| M2-07 | Recipe detail view (ingredients, steps, per-serving macros, source line) | Readable on 375 px width | TODO |
| M2-08 | Choose meal → `meal_plan_slots` + schedule plate reminder | Reminder fires at meal time + 30 min (configurable) | TODO |

## M3 — Log the plate & balance
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M3-01 | Camera/photo upload with client compression + EXIF strip | Output ≤ ~150 KB, ≤ 1080 px; no GPS metadata in stored file | TODO |
| M3-02 | AI plate estimate (range + confidence) | Uses chosen recipe if present; shows range | TODO |
| M3-03 | Confirm / correct (portion slider, edit dish/numbers) | Both AI estimate and final values stored | TODO |
| M3-04 | Manual meal log (no photo / no AI) | Works with AI consent off | TODO |
| M3-05 | Manual burn entry (active kcal; optional total) | One-tap daily entry; edit history | TODO |
| M3-06 | Daily dashboard: intake vs target, protein vs target, burn, net, 7-day trend | Labels show "estimated" where applicable | TODO |
| M3-07 | Accuracy evaluation harness: 30+ labelled South Indian plates | Report mean abs. error for kcal/protein; documented in DECISIONS | TODO |

## M4 — Weekly plan & groceries
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M4-01 | Generate 7-day lunch+dinner plan respecting targets, variety, dislikes | No dish repeated > 2×/week (configurable); each slot swappable | TODO |
| M4-02 | Grocery list aggregation (grams → shoppable units, aisle grouping) | Staples toggle; check-off persists | TODO |
| M4-03 | Share list (Web Share API → WhatsApp etc.) with copy fallback | Works on iOS Safari standalone | TODO |

## M5 — Social & motivation
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M5-01 | Invites & friendships (request/accept/block) | Blocked users can't see each other | TODO |
| M5-02 | Friends feed (photo, dish, kcal, protein) + per-meal private toggle | Respects consent + visibility (RLS test) | TODO |
| M5-03 | Reactions + short comments; report & hide | Reports land in owner moderation queue | TODO |
| M5-04 | Leaderboard (weekly, D-015 scoring) | Unit tests for caps, goal lock, flags | TODO |
| M5-05 | Message engine: triggers, caps, quiet hours, no-repeat 21 days | Respects TONE_AND_COPY §3; message centre fallback | TODO |
| M5-06 | Owner admin: invites, moderation queue, AI usage view | Admin-only via role claim | TODO |

## M6 — Privacy, hardening, launch (invite-only)
| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| M6-01 | Data export (JSON) + account deletion cascade incl. storage | Deletion verified by test | TODO |
| M6-02 | Privacy notice + "not medical advice" + AI data-use disclosure | Linked from onboarding & settings | TODO |
| M6-03 | Backup runbook (manual logical export) + restore-from-pause runbook | Documented in `docs/RUNBOOK.md` | TODO |
| M6-04 | Release checklist run (skill) on iPhone | All items pass or are logged as known issues | TODO |

## Phase 2 (later)
| ID | Story |
|---|---|
| P2-01 | Oura OAuth connect + daily activity sync (Edge Function), "synced" badge |
| P2-02 | Personalisation from meal history (likes/swaps) |
| P2-03 | Challenges (protein week, seafood week) |
| P2-04 | Tone setting (romantic / playful / coach) |
| P2-05 | Open public sign-up (after O-002, O-005, O-009 resolved) |
