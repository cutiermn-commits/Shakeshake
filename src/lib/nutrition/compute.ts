/**
 * Recipe nutrition computation (NUTRITION_RULES §3). The AI proposes ingredients in raw grams;
 * this module computes macros from the `foods` table (USDA FDC). Pure and unit-tested.
 */
import { FoodMatcher, type FoodRecord } from "./match";
import { FAT_KEYS } from "../data/ingredients";

export type NutritionStatus = "computed" | "partial" | "ai_estimate";

export interface IngredientInput {
  name: string;
  grams: number;
}

export interface Macros {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

export interface ComputedIngredient {
  rawName: string;
  grams: number;
  foodId: string | null;
  matched: boolean;
  matchKind?: string;
  added?: boolean; // default oil added by the engine
}

export interface NutritionResult {
  status: NutritionStatus;
  perServing: Macros;
  matchedMassPct: number;
  ingredients: ComputedIngredient[];
  unmatched: string[];
  oilAdded: boolean;
  sourceLine: string;
}

export const COMPUTED_THRESHOLD = 0.95;
export const PARTIAL_THRESHOLD = 0.7;
/** ASSUMPTION (NUTRITION_RULES §3.4): 1 tsp ≈ 5 g oil per serving when AI omits fat in fried/tempered dishes. */
export const DEFAULT_OIL_G_PER_SERVING = 5;

const FRY_WORDS =
  /\b(fry|fried|frying|tadka|temper|tempering|tempered|roast|roasted|sukka|varuval|poriyal|thoran|podimas|thokku|chukka|ghee roast|saute|sauté|stir[- ]fry|seasoning|splutter)\b/i;

export function needsOil(title: string, steps: string[]): boolean {
  return FRY_WORDS.test(title) || steps.some((s) => FRY_WORDS.test(s));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function statusFor(matchedPct: number): NutritionStatus {
  if (matchedPct >= COMPUTED_THRESHOLD) return "computed";
  if (matchedPct >= PARTIAL_THRESHOLD) return "partial";
  return "ai_estimate";
}

export interface ComputeOptions {
  title: string;
  steps: string[];
  servings: number;
  /** AI-provided per-serving figure, used only when status = ai_estimate. */
  aiEstimate?: Partial<Macros>;
}

export function computeRecipeNutrition(
  ingredients: IngredientInput[],
  matcher: FoodMatcher<FoodRecord>,
  opts: ComputeOptions,
): NutritionResult {
  if (!(opts.servings > 0)) throw new RangeError("servings must be > 0");
  const rows: ComputedIngredient[] = [];
  const totals: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
  let totalMass = 0;
  let matchedMass = 0;
  let hasFat = false;

  const add = (ing: IngredientInput, added = false) => {
    const grams = Math.max(0, ing.grams);
    totalMass += grams;
    const m = matcher.match(ing.name);
    if (m) {
      matchedMass += grams;
      const f = m.food;
      if (FAT_KEYS.has(f.key)) hasFat = true;
      totals.kcal += (grams / 100) * f.kcalPer100g;
      totals.proteinG += (grams / 100) * f.proteinG;
      totals.fatG += (grams / 100) * f.fatG;
      totals.carbG += (grams / 100) * f.carbG;
      rows.push({ rawName: ing.name, grams, foodId: f.id, matched: true, matchKind: m.kind, added });
    } else {
      if (/\b(oil|ghee|butter|ennai|nei)\b/i.test(ing.name)) hasFat = true;
      rows.push({ rawName: ing.name, grams, foodId: null, matched: false, added });
    }
  };

  ingredients.forEach((i) => add(i));

  let oilAdded = false;
  if (!hasFat && needsOil(opts.title, opts.steps)) {
    add({ name: "oil", grams: DEFAULT_OIL_G_PER_SERVING * opts.servings }, true);
    oilAdded = true;
  }

  const matchedMassPct = totalMass === 0 ? 0 : matchedMass / totalMass;
  const status = statusFor(matchedMassPct);
  let perServing: Macros = {
    kcal: Math.round(totals.kcal / opts.servings),
    proteinG: r1(totals.proteinG / opts.servings),
    fatG: r1(totals.fatG / opts.servings),
    carbG: r1(totals.carbG / opts.servings),
  };
  if (status === "ai_estimate" && opts.aiEstimate) {
    perServing = {
      kcal: Math.round(opts.aiEstimate.kcal ?? perServing.kcal),
      proteinG: r1(opts.aiEstimate.proteinG ?? perServing.proteinG),
      fatG: r1(opts.aiEstimate.fatG ?? perServing.fatG),
      carbG: r1(opts.aiEstimate.carbG ?? perServing.carbG),
    };
  }

  return {
    status,
    perServing,
    matchedMassPct: Math.round(matchedMassPct * 1000) / 1000,
    ingredients: rows,
    unmatched: rows.filter((r) => !r.matched).map((r) => r.rawName),
    oilAdded,
    sourceLine:
      status === "ai_estimate"
        ? "AI estimate — most ingredients could not be matched to USDA FoodData Central."
        : "Calculated from USDA FoodData Central (CC0) · raw ingredient weights.",
  };
}

/** Scale macros by a portion factor (NUTRITION_RULES §5: 0.5–2.0 slider). */
export function scaleMacros(m: Macros, factor: number): Macros {
  const f = Math.min(2, Math.max(0.5, factor));
  return { kcal: Math.round(m.kcal * f), proteinG: r1(m.proteinG * f), fatG: r1(m.fatG * f), carbG: r1(m.carbG * f) };
}
