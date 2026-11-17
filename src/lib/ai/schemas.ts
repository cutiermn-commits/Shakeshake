/**
 * Structured-output schemas for every AI call (ai-recipe-pipeline skill).
 * AI output is untrusted input: always parse with these before use.
 */
import { z } from "zod";

export const PROMPT_VERSION = "2026-11-17.1";

export const RegionSchema = z.enum(["tamil", "kerala", "andhra", "karnataka", "telangana", "mixed"]);
export const MealTypeSchema = z.enum(["lunch", "dinner"]);
export const DietTypeSchema = z.enum(["nonveg", "egg", "veg"]);

const text = (max: number) => z.string().trim().min(1).max(max);

export const RecipeSchema = z.object({
  title: text(80),
  region: RegionSchema,
  meal_type: MealTypeSchema,
  diet_type: DietTypeSchema,
  servings: z.number().int().min(1).max(8),
  cook_minutes: z.number().int().min(5).max(240),
  ingredients: z
    .array(
      z.object({
        name: text(60),
        grams: z.number().min(0.5).max(2000),
        state: z.literal("raw"),
      }),
    )
    .min(2)
    .max(30),
  steps: z.array(text(400)).min(2).max(15),
  protein_tip: text(200),
  why: text(160),
  /** AI's own per-serving guess — used ONLY when app-side computation can't match ingredients. */
  ai_kcal_per_serving: z.number().min(0).max(3000),
  ai_protein_g_per_serving: z.number().min(0).max(200),
});
export type AiRecipe = z.infer<typeof RecipeSchema>;

export const RecipeListSchema = z.object({ recipes: z.array(RecipeSchema).min(1).max(7) });

export const PlateEstimateSchema = z
  .object({
    dish_guess: text(80),
    components: z.array(z.object({ name: text(60), est_grams: z.number().min(0).max(2000) })).max(15),
    kcal_range: z.array(z.number().min(0).max(5000)).length(2),
    protein_g_range: z.array(z.number().min(0).max(300)).length(2),
    confidence: z.enum(["low", "medium", "high"]),
    portion_factor: z.number().min(0.5).max(2).optional(),
    notes: z.string().max(200).optional(),
  })
  .refine((v) => v.kcal_range[0] <= v.kcal_range[1] && v.protein_g_range[0] <= v.protein_g_range[1], {
    message: "ranges must be [low, high]",
  });
export type PlateEstimate = z.infer<typeof PlateEstimateSchema>;

/** JSON Schema passed to the model's structured-output config. */
export function jsonSchemaFor(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { target: "draft-07", unrepresentable: "any" });
}
