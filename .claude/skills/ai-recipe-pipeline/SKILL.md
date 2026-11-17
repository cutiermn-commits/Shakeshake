---
name: ai-recipe-pipeline
description: Use when creating or changing any AI prompt, output schema or post-processing for recipes, swaps, weekly plans or plate-photo estimates in lib/ai/. Enforces consent, quota, schema validation, allergy filtering and app-side nutrition computation.
---

# AI recipe & plate pipeline

Read first: `docs/NUTRITION_RULES.md`, `docs/ARCHITECTURE.md` §6, `CLAUDE.md` constraints C5–C7.

## Invariants (never break)
1. Every call passes through `lib/ai/gateway.ts`: `assertConsent('ai_processing') → checkQuota() → call → validate(zod) → postProcess() → logUsage()`.
2. Model name comes from env (`GEMINI_MODEL`), never hard-coded.
3. AI output is untrusted: validate with zod; one retry with a "fix your JSON" prompt; then fall back (cached recipe or manual flow).
4. **AI never supplies the final nutrition numbers for recipes.** It supplies ingredients in raw grams; `lib/nutrition/compute.ts` does the maths and sets `nutrition_status`.
5. **Allergy hard filter** runs after validation, using allergen names + aliases. A hit = discard recipe, regenerate or fall back.
6. Prompts carry a `PROMPT_VERSION` constant; store it on every recipe row.
7. Never send names, emails or avatars to the AI. Send only what the task needs (diet, targets, dislikes, allergies, recent dish titles).

## Changing a prompt
1. Bump `PROMPT_VERSION`.
2. Update the zod schema and TypeScript type together.
3. Update/add fixtures in `tests/fixtures/ai/` (valid, invalid, allergen-containing, oil-missing).
4. Run unit tests for compute + filter. Add a test for any new field.
5. Spot-check 5 live generations (dev only) for: South Indian authenticity, protein focus, realistic grams, oil/ghee present, no allergens. Note results in the PR.

## Recipe output schema (baseline)
```ts
{ title: string; region: 'tamil'|'kerala'|'andhra'|'karnataka'|'telangana'|'mixed';
  meal_type: 'lunch'|'dinner'; diet_type: 'nonveg'|'egg'|'veg';
  servings: number; cook_minutes: number;
  ingredients: { name: string; grams: number; state: 'raw' }[];
  steps: string[]; protein_tip: string }
```

## Plate estimate schema (baseline)
```ts
{ dish_guess: string; components: { name: string; est_grams: number }[];
  kcal_range: [number, number]; protein_g_range: [number, number];
  confidence: 'low'|'medium'|'high'; notes?: string }
```
Always show the range and require user confirmation before saving.
