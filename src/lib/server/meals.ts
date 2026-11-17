import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FoodMatcher, type FoodRecord } from "@/lib/nutrition/match";
import { runAi, type AiResult, type GatewayDeps } from "@/lib/ai/gateway";
import { geminiProviderFromEnv } from "@/lib/ai/gemini";
import { PROMPT_VERSION, RecipeListSchema, type AiRecipe } from "@/lib/ai/schemas";
import { suggestionPrompt, swapPrompt, weekPlanPrompt, type PromptContext, type SwapReason } from "@/lib/ai/prompts";
import { processRecipes, type ProcessedRecipe } from "@/lib/ai/postprocess";
import { addDays, weekStart } from "@/lib/nutrition/balance";
import type { HealthProfile, Profile, Targets } from "./dal";

export type MealType = "lunch" | "dinner";

export async function loadMatcher(supabase: SupabaseClient): Promise<FoodMatcher<FoodRecord>> {
  const { data } = await supabase.from("foods").select("id, key, name, aliases, kcal_per_100g, protein_g, fat_g, carb_g, fibre_g");
  const foods: FoodRecord[] = (data ?? []).map((f) => ({
    id: f.id,
    key: f.key,
    name: f.name,
    aliases: f.aliases ?? [],
    kcalPer100g: Number(f.kcal_per_100g),
    proteinG: Number(f.protein_g),
    fatG: Number(f.fat_g),
    carbG: Number(f.carb_g),
    fibreG: f.fibre_g == null ? null : Number(f.fibre_g),
  }));
  return new FoodMatcher(foods);
}

export function gatewayDeps(supabase: SupabaseClient): GatewayDeps {
  const perUser = Number(process.env.AI_DAILY_CALLS_PER_USER ?? 15);
  const global = Number(process.env.AI_GLOBAL_DAILY_CAP ?? 200);
  return {
    provider: geminiProviderFromEnv(),
    async hasConsent(userId, purpose) {
      const { data } = await supabase
        .from("consents")
        .select("granted")
        .eq("user_id", userId)
        .eq("purpose", purpose)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.granted === true;
    },
    async consumeQuota(_userId, kind) {
      const { data, error } = await supabase.rpc("consume_ai_quota", { p_kind: kind, p_user_limit: perUser, p_global_limit: global });
      if (error) return "global_limit";
      return data as "ok" | "user_limit" | "global_limit";
    },
  };
}

export function promptContext(profile: Profile, health: HealthProfile | null, targets: Targets | null, recentTitles: string[]): PromptContext {
  // ASSUMPTION (NUTRITION_RULES §2.2): lunch and dinner each aim for ~30–40 % of daily protein.
  const pMin = targets?.protein_g_min ?? null;
  const pMax = targets?.protein_g_max ?? null;
  return {
    dietType: profile.diet_type,
    spiceLevel: profile.spice_level,
    maxCookMinutes: profile.max_cook_minutes,
    regions: profile.regions,
    allergies: health?.allergies ?? [],
    dislikes: health?.dislikes ?? [],
    proteinTargetPerMealG: pMin && pMax ? [Math.round(pMin * 0.3), Math.round(pMax * 0.4)] : null,
    kcalPerMeal: targets ? [Math.round(targets.kcal_min * 0.3), Math.round(targets.kcal_max * 0.35)] : null,
    recentDishTitles: recentTitles,
  };
}

export async function recentTitles(supabase: SupabaseClient, uid: string): Promise<string[]> {
  const { data } = await supabase
    .from("meal_plan_slots")
    .select("recipes(title), meal_plans!inner(user_id)")
    .eq("meal_plans.user_id", uid)
    .not("recipe_id", "is", null)
    .order("date", { ascending: false })
    .limit(14);
  return ((data ?? []) as unknown as { recipes: { title: string } | null }[]).map((r) => r.recipes?.title).filter((t): t is string => !!t);
}

/** Persist an accepted recipe (+ ingredient rows). Returns the new id. */
export async function saveRecipe(supabase: SupabaseClient, uid: string, p: ProcessedRecipe): Promise<string> {
  const { recipe: r, nutrition: n } = p;
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      title: r.title,
      cuisine_region: r.region,
      meal_type: r.meal_type,
      diet_type: r.diet_type,
      servings: r.servings,
      cook_minutes: r.cook_minutes,
      steps: r.steps,
      protein_tip: r.protein_tip,
      why: r.why,
      ai_model: process.env.GEMINI_MODEL ?? null,
      prompt_version: PROMPT_VERSION,
      created_by: uid,
      nutrition_status: n.status,
      per_serving_kcal: n.perServing.kcal,
      per_serving_protein_g: n.perServing.proteinG,
      per_serving_fat_g: n.perServing.fatG,
      per_serving_carb_g: n.perServing.carbG,
      matched_mass_pct: n.matchedMassPct,
      oil_added: n.oilAdded,
      unmatched: n.unmatched,
    })
    .select("id")
    .single();
  if (error) throw error;
  const rows = n.ingredients.map((i, position) => ({
    recipe_id: data.id,
    position,
    food_id: i.foodId,
    raw_name: i.rawName,
    grams: i.grams,
    matched: i.matched,
    added: !!i.added,
  }));
  const { error: e2 } = await supabase.from("recipe_ingredients").insert(rows);
  if (e2) throw e2;
  return data.id as string;
}

/**
 * Fallback when AI is unavailable (ARCHITECTURE §6.1 step 3): reuse cached recipes that fit the
 * diet and are safe for the user's allergies. Repeats cost zero quota.
 */
export async function cachedRecipes(supabase: SupabaseClient, mealType: MealType, profile: Profile, health: HealthProfile | null, exclude: string[] = [], limit = 3): Promise<string[]> {
  const diets = profile.diet_type === "veg" ? ["veg"] : profile.diet_type === "egg" ? ["veg", "egg"] : ["veg", "egg", "nonveg"];
  const { data } = await supabase
    .from("recipes")
    .select("id, title, recipe_ingredients(raw_name)")
    .eq("meal_type", mealType)
    .in("diet_type", diets)
    .lte("cook_minutes", profile.max_cook_minutes)
    .order("created_at", { ascending: false })
    .limit(60);
  const { isSafe } = await import("@/lib/nutrition/allergy");
  const ok = ((data ?? []) as { id: string; title: string; recipe_ingredients: { raw_name: string }[] }[]).filter(
    (r) => !exclude.includes(r.id) && isSafe({ title: r.title, ingredients: r.recipe_ingredients.map((i) => ({ name: i.raw_name })) }, health?.allergies ?? [], health?.dislikes ?? []),
  );
  // simple shuffle for variety
  return ok
    .map((r) => ({ r, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, limit)
    .map((x) => x.r.id);
}

export type GenOutcome = { ids: string[]; source: "ai" | "cache"; failure?: AiResult<unknown> & { ok: false } };

async function generate(
  supabase: SupabaseClient,
  uid: string,
  kind: "suggest" | "swap" | "plan",
  prompt: string,
  mealType: MealType,
  profile: Profile,
  health: HealthProfile | null,
  want: number,
  exclude: string[] = [],
): Promise<GenOutcome> {
  const res = await runAi(gatewayDeps(supabase), { userId: uid, kind, prompt, schema: RecipeListSchema });
  if (res.ok) {
    const matcher = await loadMatcher(supabase);
    const recipes: AiRecipe[] = res.data.recipes.map((r) => ({ ...r, meal_type: mealType }));
    const { accepted } = processRecipes(recipes, matcher, { allergies: health?.allergies ?? [], dislikes: health?.dislikes ?? [], dietType: profile.diet_type });
    const ids: string[] = [];
    for (const p of accepted.slice(0, want)) ids.push(await saveRecipe(supabase, uid, p));
    if (ids.length) return { ids, source: "ai" };
  }
  const ids = await cachedRecipes(supabase, mealType, profile, health, exclude, want);
  return { ids, source: "cache", failure: res.ok ? undefined : res };
}

export async function ensurePlan(supabase: SupabaseClient, uid: string, date: string): Promise<string> {
  const ws = weekStart(date);
  const { data } = await supabase.from("meal_plans").select("id").eq("user_id", uid).eq("week_start", ws).maybeSingle();
  if (data) return data.id as string;
  const { data: created, error } = await supabase.from("meal_plans").insert({ user_id: uid, week_start: ws }).select("id").single();
  if (error) {
    // raced with another request
    const { data: again } = await supabase.from("meal_plans").select("id").eq("user_id", uid).eq("week_start", ws).single();
    return again!.id as string;
  }
  return created.id as string;
}

export async function suggestFor(supabase: SupabaseClient, uid: string, profile: Profile, health: HealthProfile | null, targets: Targets | null, date: string, mealType: MealType) {
  const ctx = promptContext(profile, health, targets, await recentTitles(supabase, uid));
  const out = await generate(supabase, uid, "suggest", suggestionPrompt(ctx, mealType, 2), mealType, profile, health, 1);
  if (!out.ids.length) return out;
  const planId = await ensurePlan(supabase, uid, date);
  await supabase.from("meal_plan_slots").upsert({ plan_id: planId, date, meal_type: mealType, recipe_id: out.ids[0], status: "planned" }, { onConflict: "plan_id,date,meal_type" });
  return out;
}

export async function swapOptions(supabase: SupabaseClient, uid: string, profile: Profile, health: HealthProfile | null, targets: Targets | null, mealType: MealType, originalTitle: string, originalId: string | null, reason: SwapReason) {
  const ctx = promptContext(profile, health, targets, await recentTitles(supabase, uid));
  const p = reason === "veg" ? { ...profile, diet_type: "veg" as const } : profile;
  return generate(supabase, uid, "swap", swapPrompt(reason === "veg" ? { ...ctx, dietType: "veg" } : ctx, mealType, originalTitle, reason), mealType, p, health, 3, originalId ? [originalId] : []);
}

/** 7-day plan (M4-01): one AI call per meal type; no dish > 2×/week (configurable). */
export const MAX_REPEATS_PER_WEEK = 2;

export async function planWeek(supabase: SupabaseClient, uid: string, profile: Profile, health: HealthProfile | null, targets: Targets | null, anyDate: string) {
  const ws = weekStart(anyDate);
  const planId = await ensurePlan(supabase, uid, ws);
  const ctx = promptContext(profile, health, targets, await recentTitles(supabase, uid));
  const results: Record<MealType, GenOutcome> = {} as never;
  for (const mealType of ["lunch", "dinner"] as const) {
    const out = await generate(supabase, uid, "plan", weekPlanPrompt(ctx, mealType), mealType, profile, health, 7);
    results[mealType] = out;
    if (!out.ids.length) continue;
    const counts = new Map<string, number>();
    const slots = [];
    for (let d = 0; d < 7; d++) {
      let id = out.ids[d % out.ids.length];
      if ((counts.get(id) ?? 0) >= MAX_REPEATS_PER_WEEK) {
        const alt = out.ids.find((x) => (counts.get(x) ?? 0) < MAX_REPEATS_PER_WEEK);
        if (!alt) break; // not enough variety — leave remaining slots empty rather than break the rule
        id = alt;
      }
      counts.set(id, (counts.get(id) ?? 0) + 1);
      slots.push({ plan_id: planId, date: addDays(ws, d), meal_type: mealType, recipe_id: id, status: "planned" });
    }
    if (slots.length) await supabase.from("meal_plan_slots").upsert(slots, { onConflict: "plan_id,date,meal_type" });
  }
  return results;
}
