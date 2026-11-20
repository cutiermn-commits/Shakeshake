import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FoodMatcher, type FoodRecord } from "@/lib/nutrition/match";
import { runAi, type AiResult, type GatewayDeps } from "@/lib/ai/gateway";
import { aiProviderFromEnv } from "@/lib/ai/providers";
import { PROMPT_VERSION, RecipeListSchema, type AiRecipe } from "@/lib/ai/schemas";
import { suggestionPrompt, swapPrompt, weekPlanPrompt, type PromptContext, type SwapReason } from "@/lib/ai/prompts";
import { processRecipes, type ProcessedRecipe } from "@/lib/ai/postprocess";
import { addDays, weekStart } from "@/lib/nutrition/balance";
import { AI_CONSENT_MIN_VERSION, type HealthProfile, type Profile, type Targets } from "./dal";

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
    provider: aiProviderFromEnv(),
    async hasConsent(userId, purpose) {
      const { data } = await supabase
        .from("consents")
        .select("granted, version")
        .eq("user_id", userId)
        .eq("purpose", purpose)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.granted !== true) return false;
      // AI consent must cover the current list of AI providers (D-033).
      return purpose !== "ai_processing" || String(data.version) >= AI_CONSENT_MIN_VERSION;
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
export type CachePreference = "more_protein" | "faster" | "different_protein" | "veg" | "any";

/**
 * Fallback when AI is unavailable (ARCHITECTURE §6.1 step 3, D-031): pick from saved recipes — the
 * built-in library plus earlier AI recipes — that fit the diet and are safe for allergies/dislikes.
 * Avoids recently planned dishes; honours swap reasons; relaxes cooking time if nothing fits.
 */
export async function cachedRecipes(
  supabase: SupabaseClient,
  mealType: MealType,
  profile: Profile,
  health: HealthProfile | null,
  exclude: string[] = [],
  limit = 3,
  opts: { prefer?: CachePreference; recentTitles?: string[]; original?: { protein: number; minutes: number } | null } = {},
): Promise<string[]> {
  const diets = profile.diet_type === "veg" ? ["veg"] : profile.diet_type === "egg" ? ["veg", "egg"] : ["veg", "egg", "nonveg"];
  const { data } = await supabase
    .from("recipes")
    .select("id, title, cook_minutes, per_serving_protein_g, recipe_ingredients(raw_name)")
    .eq("meal_type", mealType)
    .in("diet_type", diets)
    .order("created_at", { ascending: false })
    .limit(300);
  const { isSafe } = await import("@/lib/nutrition/allergy");
  type Row = { id: string; title: string; cook_minutes: number; per_serving_protein_g: number; recipe_ingredients: { raw_name: string }[] };
  const recent = new Set((opts.recentTitles ?? []).map((t) => t.toLowerCase()));
  const safe = ((data ?? []) as Row[]).filter(
    (r) => !exclude.includes(r.id) && isSafe({ title: r.title, ingredients: r.recipe_ingredients.map((i) => ({ name: i.raw_name })) }, health?.allergies ?? [], health?.dislikes ?? []),
  );
  const fresh = safe.filter((r) => !recent.has(r.title.toLowerCase()));
  let pool = (fresh.length >= limit ? fresh : safe).filter((r) => r.cook_minutes <= profile.max_cook_minutes);
  if (pool.length < limit) pool = fresh.length >= limit ? fresh : safe; // nothing fits the usual time → relax it
  const o = opts.original;
  if (opts.prefer === "more_protein" && o) pool = pool.filter((r) => Number(r.per_serving_protein_g) > o.protein).sort((a, b) => Number(b.per_serving_protein_g) - Number(a.per_serving_protein_g));
  else if (opts.prefer === "faster" && o) pool = pool.filter((r) => r.cook_minutes < o.minutes).sort((a, b) => a.cook_minutes - b.cook_minutes);
  else pool = pool.map((r) => ({ r, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.r); // shuffle for variety
  if (opts.prefer === "more_protein" || opts.prefer === "faster") {
    // keep some variety among the qualifying ones
    pool = pool.slice(0, Math.max(limit * 2, limit)).map((r) => ({ r, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.r);
  }
  return pool.slice(0, limit).map((r) => r.id);
}

export type GenOutcome = { ids: string[]; source: "ai" | "cache"; failure?: AiResult<unknown> & { ok: false }; filteredOut?: number };

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
  cacheOpts: Parameters<typeof cachedRecipes>[6] = {},
): Promise<GenOutcome> {
  const started = Date.now();
  const res = await runAi(gatewayDeps(supabase), { userId: uid, kind, prompt, schema: RecipeListSchema });
  let filteredOut = 0;
  if (res.ok) {
    const matcher = await loadMatcher(supabase);
    const recipes: AiRecipe[] = res.data.recipes.map((r) => ({ ...r, meal_type: mealType }));
    const { accepted, rejected } = processRecipes(recipes, matcher, { allergies: health?.allergies ?? [], dislikes: health?.dislikes ?? [], dietType: profile.diet_type });
    filteredOut = rejected.length;
    const ids: string[] = [];
    for (const p of accepted.slice(0, want)) {
      try {
        ids.push(await saveRecipe(supabase, uid, p));
      } catch (e) {
        console.error(`[meals] saveRecipe failed kind=${kind}`, e);
      }
    }
    console.info(`[meals] ${kind} ai ok ms=${Date.now() - started} got=${recipes.length} rejected=${rejected.length} saved=${ids.length}`);
    if (ids.length) return { ids, source: "ai" };
  } else {
    console.warn(`[meals] ${kind} ai failed reason=${res.reason} ms=${Date.now() - started} ${res.detail ?? ""}`.trim());
  }
  const ids = await cachedRecipes(supabase, mealType, profile, health, exclude, want, cacheOpts);
  return { ids, source: "cache", failure: res.ok ? undefined : res, filteredOut };
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
  const recent = await recentTitles(supabase, uid);
  const ctx = promptContext(profile, health, targets, recent);
  const out = await generate(supabase, uid, "suggest", suggestionPrompt(ctx, mealType, 2), mealType, profile, health, 1, [], { recentTitles: recent });
  if (!out.ids.length) return out;
  const planId = await ensurePlan(supabase, uid, date);
  const { error } = await supabase
    .from("meal_plan_slots")
    .upsert({ plan_id: planId, date, meal_type: mealType, recipe_id: out.ids[0], status: "planned" }, { onConflict: "plan_id,date,meal_type" });
  if (error) {
    console.error("[meals] saving the day's slot failed", error);
    throw new Error(`slot upsert failed: ${error.message}`);
  }
  return out;
}

export async function swapOptions(supabase: SupabaseClient, uid: string, profile: Profile, health: HealthProfile | null, targets: Targets | null, mealType: MealType, originalTitle: string, originalId: string | null, reason: SwapReason) {
  const recent = await recentTitles(supabase, uid);
  const ctx = promptContext(profile, health, targets, recent);
  const { data: orig } = originalId ? await supabase.from("recipes").select("per_serving_protein_g, cook_minutes").eq("id", originalId).maybeSingle() : { data: null };
  const original = orig ? { protein: Number(orig.per_serving_protein_g), minutes: orig.cook_minutes as number } : null;
  const p = reason === "veg" ? { ...profile, diet_type: "veg" as const } : profile;
  return generate(supabase, uid, "swap", swapPrompt(reason === "veg" ? { ...ctx, dietType: "veg" } : ctx, mealType, originalTitle, reason), mealType, p, health, 3, originalId ? [originalId] : [], { prefer: reason, recentTitles: recent, original });
}

/** 7-day plan (M4-01): one AI call per meal type; no dish > 2×/week (configurable). */
export const MAX_REPEATS_PER_WEEK = 2;

export async function planWeek(supabase: SupabaseClient, uid: string, profile: Profile, health: HealthProfile | null, targets: Targets | null, anyDate: string) {
  const ws = weekStart(anyDate);
  const planId = await ensurePlan(supabase, uid, ws);
  const recent = await recentTitles(supabase, uid);
  const ctx = promptContext(profile, health, targets, recent);
  const results: Record<MealType, GenOutcome> = {} as never;
  for (const mealType of ["lunch", "dinner"] as const) {
    const out = await generate(supabase, uid, "plan", weekPlanPrompt(ctx, mealType), mealType, profile, health, 7, [], { recentTitles: recent });
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
    if (slots.length) {
      const { error } = await supabase.from("meal_plan_slots").upsert(slots, { onConflict: "plan_id,date,meal_type" });
      if (error) throw new Error(`plan upsert failed: ${error.message}`);
    }
  }
  return results;
}
