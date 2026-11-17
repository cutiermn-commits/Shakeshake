# Product Brief — Shake Shake

*Status: v0.1 draft for owner approval · Date: 2026-11-17 · Owner: Mani*

## 1. Problem

The primary user — a 40-year-old, fitness-focused Indian woman — wants **more protein from real food instead of ready-made protein shakes**, cooked in the **South Indian style** she loves, without compromising health. Today she struggles with:

1. **What to cook:** no easy source of protein-rich South Indian lunch/dinner ideas.
2. **Planning & shopping:** turning ideas into a weekly plan and grocery list.
3. **Tracking:** knowing calories/protein eaten vs. calories burned (from her Oura ring) without tedious logging.
4. **Motivation:** staying consistent and having fun doing it — with friends.

## 2. Vision

> *"Shake Shake — the only shake you need is the one you give the pan."*
> A playful, loving, mobile app that tells her what to cook today, shops for the week, reads her plate from a photo, and cheers her on — with her friends along for the ride.

## 3. Personas

| Persona | Description | Key needs |
|---|---|---|
| **P1 — Primary user** (girlfriend) | 40, India, iPhone, Oura ring, non-vegetarian, trains regularly, loves South Indian food | Protein-rich ideas, swaps, weekly plan, grocery list, photo-based tracking, intake vs burn, motivation |
| **P2 — Friend** | Invited by P1; may or may not wear a tracker; any phone | Simple sign-up, see friends' meals, compete fairly, own targets |
| **P3 — Owner/admin** (Mani) | Builds & runs the app on $0 | Low ops, quota safety, invite control, moderation tools |

## 4. Core user journeys

### J1 — Onboarding (≤ 3 minutes)
1. Open invite link → sign in with email OTP / magic link.
2. Profile: name, avatar (upload or pick an illustrated one), city (for ingredient context).
3. Body & goal: age, sex, height, weight, activity level, goal (lose / maintain / gain / recomposition).
4. Diet: non-veg / egg / veg, dislikes, allergies (stored as sensitive), spice level, cooking time available.
5. App **suggests** calorie & protein ranges (formula + source shown) → she edits/accepts.
6. Consents (separate toggles): (a) store health data, (b) AI photo & meal analysis via Google Gemini free tier (data may be used by Google to improve its products), (c) share meals & stats with friends.
7. iPhone: guided "Add to Home Screen" → "Turn on reminders" button.

### J2 — Daily: what's for lunch/dinner?
1. Home shows today's **lunch** and **dinner** suggestion cards: dish name, photo-style illustration, protein (g), kcal, cook time, "why it's good".
2. Actions: **Choose**, **Swap** (get alternatives — "more protein", "faster", "different meat", "veg tonight"), **View recipe**.
3. Choosing logs a *planned meal* and schedules a **"show me your plate" reminder** around her usual meal time.

### J3 — Log the real plate
1. Reminder push → opens camera upload.
2. Photo compressed on device → AI estimates dish, portion and kcal/protein **as a range** with confidence.
3. She confirms or corrects (portion slider, swap dish, edit numbers). Corrected values are saved; AI estimate retained for transparency.
4. Manual path always available (no photo or AI consent off).

### J4 — Burn & balance
1. Enter today's calories burned (active kcal from Oura app) manually — phase 2: Oura auto-sync.
2. Dashboard: intake vs. target, protein vs. target, burn, net balance, 7-day trend.

### J5 — Weekly plan & groceries
1. "Plan my week" → AI drafts 7 lunches + 7 dinners respecting targets, variety rules and dislikes; she can swap any slot.
2. Grocery list aggregates ingredients (grams → shoppable units), grouped by aisle (meat & fish, dairy, pulses, vegetables, spices…), with pantry-staple toggle and check-off.
3. Share list (copy / WhatsApp share sheet).

### J6 — Friends & fun
1. Invite friends via link.
2. Feed: friends' meals (photo, dish, kcal, protein — per her choice of sharing everything) + reactions (❤️ 🔥 💪 😋) and short comments.
3. Leaderboard (weekly, fair scoring — see §7).
4. Motivation & romance messages: morning nudge, meal reminders, streak celebrations, playful roasts (gentle), love notes.

## 5. Scope

### In scope — Release 1 (invite-only)
Profiles & avatars · targets with formula suggestion · AI daily suggestions + swaps · recipe view · choose & log · photo AI estimate with correction · manual burn entry · daily dashboard · weekly plan · grocery list · invites · friends feed · reactions · leaderboard · motivation messages · web push reminders · consent & privacy centre · data export & delete · report/ hide content.

### Phase 2
Oura OAuth auto-sync (activity/active calories) · smarter recipe personalisation from history · pantry tracking · challenges (e.g. "protein week") · tone setting.

### Out of scope (for now)
Native iOS/Android app · Apple Health / Google Fit (a browser app can't read them directly) · payments · dietitian/coach portal · barcode scanning · open public sign-up (until moderation + quota protection are proven).

## 6. Success measures (to validate, not promises)

| Measure | Target (HYPOTHESIS — to be confirmed with the user) |
|---|---|
| She uses it to decide at least one meal per day | ≥ 5 days/week after week 2 |
| Plate photos logged for chosen meals | ≥ 60 % |
| Days protein target met | trending up over 4 weeks |
| Friends invited and active weekly | ≥ 3 |
| Monthly running cost | $0 |

## 7. Leaderboard — industry-practice basis

Raw calories burned favours heavier/taller people and is easy to inflate with manual entry. The common industry pattern — e.g. Apple Watch Activity Competitions — awards **1 point per percent of the person's own goal, capped per day** (Apple: up to 600 points/day). *(DOCUMENTED PRACTICE — secondary sources quoting Apple's support document; see ARCHITECTURE §8.)*

**Shake Shake scoring (proposal):**
- **Move points:** 1 pt per 1 % of own daily active-kcal goal, cap 200/day.
- **Protein points:** 1 pt per 1 % of own protein target, cap 100/day (rewards the app's purpose, not over-eating).
- **Logging points:** +20 per photo-logged meal (max 2/day), +10 daily streak bonus.
- **Daily cap:** 350 (200 + 100 + 40 + 10). Weekly board, resets Monday 00:00 IST.
- **Integrity:** entries badged *manual* vs *synced* (phase 2); unusual manual entries (e.g. > 2× personal 30-day median) flagged; goals locked for the week once a competition week starts (avoids "lower goal to win").
- Raw calories burned still **shown** as a stat, just not the ranking basis.

## 8. Naming

**Shake Shake** — owner's choice. ⚠️ NOT VERIFIED: possible confusion with the "Shake Shack" restaurant trademark. Fine for a private/invite-only app; do a trademark check before any public launch or app-store listing.

## 9. Key risks (summary — detail in ARCHITECTURE §10)

AI calorie-from-photo accuracy · free-tier quota/terms changes · Supabase free project pause after 7 days inactivity · 1 GB photo storage · iOS PWA push limitations · health-data compliance · AI nutrition hallucination · social content moderation.
