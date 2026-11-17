/**
 * Post-processing of validated AI recipes: allergy/dislike hard filter, then app-side nutrition.
 * AI never supplies the final nutrition numbers (ai-recipe-pipeline invariant 4) unless the
 * ingredients can't be matched, in which case the result is badged "AI estimate".
 */
import { computeRecipeNutrition, type NutritionResult } from "../nutrition/compute";
import { findConflicts, type FilterHit } from "../nutrition/allergy";
import type { FoodMatcher, FoodRecord } from "../nutrition/match";
import type { AiRecipe } from "./schemas";

export interface ProcessedRecipe {
  recipe: AiRecipe;
  nutrition: NutritionResult;
}

export interface ProcessOutcome {
  accepted: ProcessedRecipe[];
  rejected: { title: string; hits: FilterHit[] }[];
}

export function processRecipes(
  recipes: AiRecipe[],
  matcher: FoodMatcher<FoodRecord>,
  profile: { allergies: string[]; dislikes: string[]; dietType: "nonveg" | "egg" | "veg" },
): ProcessOutcome {
  const out: ProcessOutcome = { accepted: [], rejected: [] };
  for (const r of recipes) {
    const hits = findConflicts(r, profile.allergies, profile.dislikes);
    // Diet guard: never show meat/fish to veg users, or meat/fish to egg users.
    if (profile.dietType !== "nonveg") {
      const banned = profile.dietType === "veg" ? ["chicken", "mutton", "fish", "prawn", "crab", "egg", "meat", "keema", "squid", "anchovy", "sardine", "mackerel"] : ["chicken", "mutton", "fish", "prawn", "crab", "meat", "keema", "squid", "anchovy", "sardine", "mackerel"];
      hits.push(...findConflicts(r, [], banned).map((h) => ({ ...h, declared: `diet:${profile.dietType} (${h.declared})` })));
      if (profile.dietType === "veg" && r.diet_type !== "veg") hits.push({ kind: "dislike", declared: "diet:veg", matchedIn: r.diet_type });
    }
    if (hits.length) {
      out.rejected.push({ title: r.title, hits });
      continue;
    }
    const nutrition = computeRecipeNutrition(r.ingredients, matcher, {
      title: r.title,
      steps: r.steps,
      servings: r.servings,
      aiEstimate: { kcal: r.ai_kcal_per_serving, proteinG: r.ai_protein_g_per_serving },
    });
    out.accepted.push({ recipe: r, nutrition });
  }
  return out;
}
