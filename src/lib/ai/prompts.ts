/**
 * Prompt builders. Never include names, emails or avatars (ai-recipe-pipeline invariant 7).
 */
import { PROMPT_VERSION } from "./schemas";

export { PROMPT_VERSION };

export interface PromptContext {
  dietType: "nonveg" | "egg" | "veg";
  spiceLevel: "mild" | "medium" | "hot";
  maxCookMinutes: number;
  regions: string[]; // preferred styles, e.g. ["tamil","kerala"] or ["mixed"]
  allergies: string[];
  dislikes: string[];
  proteinTargetPerMealG: [number, number] | null;
  kcalPerMeal: [number, number] | null;
  recentDishTitles: string[];
}

export type SwapReason = "more_protein" | "faster" | "different_protein" | "veg" | "any";

const SWAP_TEXT: Record<SwapReason, string> = {
  more_protein: "noticeably MORE protein per serving than the original",
  faster: "a SHORTER total cooking time than the original",
  different_protein: "a DIFFERENT main protein source than the original",
  veg: "fully VEGETARIAN (no meat, fish or egg)",
  any: "a different dish that still fits the constraints",
};

function constraints(c: PromptContext): string {
  return [
    `Diet: ${c.dietType === "nonveg" ? "non-vegetarian (seafood, chicken, mutton, egg allowed; veg also fine)" : c.dietType === "egg" ? "eggetarian (egg allowed, no meat or fish)" : "vegetarian (no meat, fish or egg)"}.`,
    `Spice level: ${c.spiceLevel}.`,
    `Maximum cooking time: ${c.maxCookMinutes} minutes.`,
    `Preferred styles: ${c.regions.join(", ") || "mixed South Indian"}.`,
    c.allergies.length ? `ALLERGIES — must NOT contain, in any form: ${c.allergies.join(", ")}.` : "No declared allergies.",
    c.dislikes.length ? `Avoid (dislikes): ${c.dislikes.join(", ")}.` : "",
    c.proteinTargetPerMealG ? `Aim for ${c.proteinTargetPerMealG[0]}–${c.proteinTargetPerMealG[1]} g protein per serving.` : "Make it protein-rich.",
    c.kcalPerMeal ? `Aim for roughly ${c.kcalPerMeal[0]}–${c.kcalPerMeal[1]} kcal per serving.` : "",
    c.recentDishTitles.length ? `For variety, do not repeat these recent dishes: ${c.recentDishTitles.slice(0, 14).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const RULES = `Rules:
- Authentic, home-style South Indian dishes; protein-rich from real food (no protein shakes or powders).
- List EVERY ingredient with its RAW weight in grams for the whole recipe (state: "raw"), including oil, ghee, coconut and rice/millet portions. Use common English names; you may add the local name in parentheses.
- Realistic portions for the stated servings.
- Steps: short, clear, numbered by order. No HTML, no markdown.
- "why": one friendly line on why it's a good protein choice. No body/weight comments, no food moralising.
- ai_kcal_per_serving / ai_protein_g_per_serving: your best estimate (the app recomputes from a food database).
- Output JSON only, matching the schema.`;

export function suggestionPrompt(c: PromptContext, mealType: "lunch" | "dinner", count: number): string {
  return `You are a South Indian home-cooking assistant focused on protein-rich meals.
Suggest ${count} different ${mealType} recipe(s).
${constraints(c)}
${RULES}`;
}

export function swapPrompt(c: PromptContext, mealType: "lunch" | "dinner", originalTitle: string, reason: SwapReason): string {
  return `You are a South Indian home-cooking assistant focused on protein-rich meals.
The user wants to swap "${originalTitle}" for ${mealType}. Suggest 3 alternatives, each ${SWAP_TEXT[reason]}.
${constraints(c)}
${RULES}`;
}

export function weekPlanPrompt(c: PromptContext, mealType: "lunch" | "dinner"): string {
  return `You are a South Indian home-cooking assistant focused on protein-rich meals.
Plan 7 different ${mealType} recipes for one week (Monday to Sunday, in order). Vary the main protein across the week (seafood, chicken, mutton, egg, pulses/paneer as the diet allows) and vary regional styles.
${constraints(c)}
${RULES}`;
}

export function platePrompt(hint: { recipeTitle?: string; vessel?: "plate" | "bowl" | "banana_leaf" | "thali" }): string {
  return `You estimate food from a photo of a single meal (South Indian context).
${hint.recipeTitle ? `The person says this is (or includes) "${hint.recipeTitle}".` : "No dish name was given."}
${hint.vessel ? `It is served on/in a ${hint.vessel.replace("_", " ")}.` : ""}
Identify the dish and visible components, estimate grams per component, and give a kcal RANGE and protein RANGE for the whole serving, plus your confidence.
If a chosen recipe was named, also give portion_factor (0.5–2.0) relative to one normal serving.
Never comment on any person in the photo. If the photo is not food, return confidence "low" and zero ranges.
Output JSON only, matching the schema.`;
}
