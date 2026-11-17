# Nutrition Rules — Shake Shake

*Status: v0.1 · 2026-11-17 · These rules are product logic, not medical advice. Every number shown to users must say where it came from.*

## 1. Principles

1. **Suggest, never prescribe.** Targets are editable ranges with the formula and source shown.
2. **App computes, AI proposes.** AI writes recipes (ingredients in grams); the nutrition engine computes macros from the `foods` table.
3. **Ranges over false precision.** Photo estimates are shown as ranges with confidence.
4. **Safety rails beat engagement.** No extreme deficits, no "earn your food" mechanics.

## 2. Daily target suggestion

### 2.1 Energy
- **BMR — Mifflin-St Jeor** (DOCUMENTED, widely used clinical equation):
  - Women: `BMR = 10·kg + 6.25·cm − 5·age − 161`
  - Men: `BMR = 10·kg + 6.25·cm − 5·age + 5`
- **TDEE = BMR × activity factor** — 1.2 sedentary · 1.375 light · 1.55 moderate · 1.725 very active · 1.9 extra active (DOCUMENTED standard factors).
- **Indian context note:** ICMR-NIN 2020 reduced BMR estimates for Indian adults by a further 5 % vs the earlier committee (VERIFIED: NIN brief note, https://www.nin.res.in/rdabook/brief_note.pdf). Offer an "Indian-adjusted (−5 %)" option and show both. (ASSUMPTION: applying −5 % to Mifflin is a pragmatic approximation, not an ICMR method.)
- **Goal adjustment** (ASSUMPTION — confirm with a dietitian if possible):
  - Lose: TDEE − 10 % to − 20 % (max). Maintain: ± 5 %. Gain: + 5 % to + 10 %.
  - **Floor:** never suggest below BMR; if the user manually sets kcal below BMR, show a gentle warning and suggest professional guidance.

*Illustrative only (not the user's data):* 40-year-old woman, 60 kg, 160 cm, moderate → BMR = 600 + 1000 − 200 − 161 = **1,239 kcal**; TDEE = 1,239 × 1.55 ≈ **1,920 kcal**.

### 2.2 Protein
| Situation | Range (g/kg/day) | Class / source |
|---|---|---|
| Floor — healthy sedentary Indian adult (RDA) | 0.83 | VERIFIED — ICMR-NIN 2020 |
| Regular exercise | 1.0 – 1.2 | DOCUMENTED — commonly cited for active adults |
| Training / muscle-building / in a deficit | 1.6 – 2.2 | DOCUMENTED — ISSN position stand (Jäger et al., 2017) as cited secondarily; verify primary before launch |

- Suggest a range by activity + goal; user picks.
- **Split guidance:** lunch and dinner each aim for ~30–40 % of daily protein (ASSUMPTION — product heuristic since the app plans only lunch & dinner; breakfast/snacks logged freely).
- **Medical flag:** onboarding asks "Any condition where a doctor limits your protein (e.g. kidney disease) or are you pregnant/breastfeeding?" → if yes, don't suggest high-protein ranges; show "follow your doctor's target" and let her enter it.

### 2.3 Active-calorie goal (for leaderboard)
- Default = user-entered; suggestion = her 14-day median of logged active kcal (once available), else 300–500 kcal (ASSUMPTION placeholder).
- Locked for the competition week once the week starts.

## 3. Recipe nutrition computation

1. AI returns `ingredients[{name, grams, state: raw|cooked}]`. **Always ask for raw weights** (matches FDC raw entries; IFCT is also raw-based).
2. Match `name` → `foods` via exact/alias/fuzzy match; South Indian alias list (e.g. *toor dal / tuvaram paruppu / arhar*, *curd / thayir / yogurt*, *seer fish / vanjaram / king mackerel*, *drumstick leaves / murungai keerai / moringa*).
3. `macro = Σ(grams/100 × per100g)`; divide by servings.
4. **Count fats explicitly** — tempering oil, ghee, coconut (fresh/grated/milk). If AI omits oil in a fried/tempered dish, add a default (ASSUMPTION: 1 tsp ≈ 5 g oil per serving) and flag it.
5. `nutrition_status`:
   - `computed` — ≥ 95 % of ingredient mass matched.
   - `partial` — 70–95 % matched → show "≈" and list unmatched items.
   - `ai_estimate` — < 70 % matched → show AI figure with "AI estimate" badge.
6. Show source line: *"Calculated from USDA FoodData Central (CC0) · raw ingredient weights."*

## 4. Protein-rich South Indian guidance for the recipe prompt

The prompt should steer toward (non-exhaustive, non-veg + veg mix):
- **Seafood:** fish curry (meen kuzhambu), fish fry / tawa fry, prawn thokku, crab rasam, nethili (anchovy) fry.
- **Chicken / mutton / egg:** chettinad chicken (lean cuts), pepper chicken, chicken sukka, mutton kola urundai (portion-aware), egg curry, egg podimas, keema.
- **Pulses & dairy:** sundal (chana / green gram / rajma), pesarattu, adai (multi-dal), kootu with dal, paneer/tofu podi fry, curd-based dishes, sprouts salad.
- **Swaps to raise protein:** add egg whites / paneer to upma; ragi + dal adai instead of plain dosa; more dal, less rice; buttermilk instead of sugary drinks.
- **Rice/millet portioning:** suggest portion sizes; offer millet (ragi, foxtail, little millet) alternatives.
*Dish list is creative guidance, not nutrition evidence — nutrition always comes from §3.*

## 5. Photo estimate rules

- Output: dish guess, components[{name, est_grams}], kcal range, protein range, confidence (low/med/high).
- If a chosen recipe exists: `macros = recipe_per_serving × estimated_portion_factor` (0.5–2.0 slider).
- Always ask for confirmation. Store `ai_estimate` and final values separately (needed for accuracy evaluation).
- Never comment on the person's body if a person is visible; advise plate-only photos.

## 6. Daily balance

```
net = intake_kcal − (resting_estimate + active_kcal)    # display both components
```
- If only active kcal is known (manual Oura entry), resting = BMR estimate (labelled "estimated").
- Phase 2 (Oura): use Oura's total calories if available (NOT VERIFIED field names) and label "from Oura".

## 7. Language guardrails (also see TONE_AND_COPY)

- No "good/bad food", no "cheat meal", no "burn it off".
- Under-target protein → encouraging suggestion, not alarm.
- Repeated very low intake logs (e.g. < 1,000 kcal on 3 consecutive days — ASSUMPTION threshold) → stop playful roasts, show a caring check-in with "consider talking to a doctor or dietitian". Do not gamify restriction.
