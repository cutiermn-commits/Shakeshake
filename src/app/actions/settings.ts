"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CONSENT_VERSION, getHealthProfile, requireMember, type ConsentPurpose } from "@/lib/server/dal";
import { createAdminClient } from "@/lib/supabase/server";
import { ageFromBirthYear, suggestTargets } from "@/lib/nutrition/targets";
import { buildGroceryList } from "@/lib/nutrition/grocery";
import { weekStart } from "@/lib/nutrition/balance";
import { playfulNote } from "@/lib/server/notes";
import type { ActionResult } from "./meals";

const Purpose = z.enum(["health_data", "ai_processing", "social_sharing", "marketing_push"]);

/**
 * M1-05: separate, versioned, revocable consents (append-only history).
 * Revoking health_data deletes the health profile (purpose limitation, DPDP — see DECISIONS D-024).
 */
export async function setConsent(purpose: ConsentPurpose, granted: boolean): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const p = Purpose.parse(purpose);
  const now = new Date().toISOString();
  const { error } = await supabase.from("consents").insert({ user_id: uid, purpose: p, granted, version: CONSENT_VERSION, granted_at: granted ? now : null, revoked_at: granted ? null : now });
  if (error) return { ok: false, error: "Couldn't update that setting." };
  if (p === "health_data" && !granted) await supabase.from("health_profile").delete().eq("user_id", uid);
  if (p === "marketing_push" && !granted) await supabase.from("push_subscriptions").delete().eq("user_id", uid);
  revalidatePath("/settings");
  return { ok: true };
}

const ProfileSchema = z.object({
  display_name: z.string().trim().min(1).max(40),
  city: z.string().trim().max(60).optional(),
  diet_type: z.enum(["nonveg", "egg", "veg"]),
  spice_level: z.enum(["mild", "medium", "hot"]),
  max_cook_minutes: z.coerce.number().int().min(10).max(240),
  lunch_time: z.string().regex(/^\d{2}:\d{2}/),
  dinner_time: z.string().regex(/^\d{2}:\d{2}/),
  timezone: z.string().min(3).max(60),
});

export async function updateProfile(_prev: unknown, form: FormData): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const parsed = ProfileSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, error: "Please check your details." };
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false, error: "Unknown timezone." };
  }
  const regions = form.getAll("regions").map(String);
  const muted = form.getAll("muted").map(String);
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, city: parsed.data.city || null, regions: regions.length ? regions : ["mixed"], muted_categories: muted })
    .eq("id", uid);
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/", "layout");
  return { ok: true, note: "Saved." };
}

const HealthSchema = z.object({
  weight_kg: z.coerce.number().min(30).max(250),
  activity_level: z.enum(["sedentary", "light", "moderate", "very_active", "extra_active"]),
  goal: z.enum(["lose", "maintain", "gain", "recomposition"]),
  allergies: z.string().max(500),
  dislikes: z.string().max(500),
  kcal_min: z.coerce.number().int().min(800).max(6000),
  kcal_max: z.coerce.number().int().min(800).max(6000),
  protein_g_min: z.coerce.number().int().min(10).max(400),
  protein_g_max: z.coerce.number().int().min(10).max(400),
  active_kcal_goal: z.coerce.number().int().min(50).max(3000),
});

/** Update health profile + a new targets row (effective today). Weekly leaderboard goals stay locked. */
export async function updateHealthAndTargets(_prev: unknown, form: FormData): Promise<ActionResult> {
  const { uid, supabase, today } = await requireMember();
  const parsed = HealthSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, error: "Please check the numbers." };
  const v = parsed.data;
  if (v.kcal_min > v.kcal_max || v.protein_g_min > v.protein_g_max) return { ok: false, error: "Minimum values must be below maximum values." };
  const split = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
  const hp = await getHealthProfile();
  const { error } = await supabase.from("health_profile").upsert({ user_id: uid, weight_kg: v.weight_kg, activity_level: v.activity_level, goal: v.goal, allergies: split(v.allergies), dislikes: split(v.dislikes), updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn't save health details (is the health-data consent on?)." };
  let method = "User-set";
  let bmr: number | null = null;
  let note = "Set by you.";
  if (hp?.sex && hp.height_cm && hp.birth_year) {
    const s = suggestTargets({ sex: hp.sex, weightKg: v.weight_kg, heightCm: Number(hp.height_cm), age: ageFromBirthYear(hp.birth_year), activity: v.activity_level, goal: v.goal, medicalFlag: hp.medical_flag });
    bmr = s.bmr;
    method = `User-set (suggested: ${s.method})`;
    note = s.sourceNote;
  }
  await supabase.from("targets").upsert(
    { user_id: uid, effective_from: today, kcal_min: v.kcal_min, kcal_max: v.kcal_max, protein_g_min: v.protein_g_min, protein_g_max: v.protein_g_max, active_kcal_goal: v.active_kcal_goal, bmr, method, source_note: note, user_overridden: true },
    { onConflict: "user_id,effective_from" },
  );
  revalidatePath("/", "layout");
  return { ok: true, note: "Saved. Leaderboard goals update from next week (goals are locked per week)." };
}

const SubSchema = z.object({ endpoint: z.url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

/** M1-06: push subscription — only ever called after a user tap (permission prompt). */
export async function savePushSubscription(sub: unknown, userAgent: string): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const parsed = SubSchema.safeParse(sub);
  if (!parsed.success) return { ok: false, error: "Invalid subscription." };
  const now = new Date().toISOString();
  await supabase.from("consents").insert({ user_id: uid, purpose: "marketing_push", granted: true, version: CONSENT_VERSION, granted_at: now });
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: uid, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, user_agent: userAgent.slice(0, 300) }, { onConflict: "endpoint" });
  if (error) return { ok: false, error: "Couldn't save the subscription." };
  revalidatePath("/settings");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  await supabase.from("push_subscriptions").delete().eq("user_id", uid).eq("endpoint", endpoint);
  revalidatePath("/settings");
  return { ok: true };
}

export async function markInboxRead(): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  await supabase.from("message_sends").update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null);
  revalidatePath("/inbox");
  return { ok: true };
}

/** M4-02: (re)build this week's grocery list from the plan; keeps check-offs for unchanged items. */
export async function buildGrocery(weekOf: string): Promise<ActionResult> {
  const { uid, supabase, today } = await requireMember();
  const ws = weekStart(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(weekOf));
  const { data: plan } = await supabase.from("meal_plans").select("id").eq("user_id", uid).eq("week_start", ws).maybeSingle();
  if (!plan) return { ok: false, error: "Plan your week first." };
  const { data: slots } = await supabase
    .from("meal_plan_slots")
    .select("servings, status, recipes(servings, recipe_ingredients(raw_name, grams))")
    .eq("plan_id", plan.id)
    .neq("status", "skipped")
    .not("recipe_id", "is", null);
  type S = { servings: number; recipes: { servings: number; recipe_ingredients: { raw_name: string; grams: number }[] } | null };
  const items = buildGroceryList(
    ((slots ?? []) as unknown as S[])
      .filter((s) => s.recipes)
      .map((s) => ({ servings: s.recipes!.servings, servingsToCook: s.servings, ingredients: s.recipes!.recipe_ingredients.map((i) => ({ name: i.raw_name, grams: Number(i.grams) })) })),
  );
  let { data: list } = await supabase.from("grocery_lists").select("id").eq("user_id", uid).eq("week_start", ws).maybeSingle();
  if (!list) ({ data: list } = await supabase.from("grocery_lists").insert({ user_id: uid, week_start: ws }).select("id").single());
  const { data: old } = await supabase.from("grocery_items").select("food_key, name, checked").eq("list_id", list!.id);
  const checked = new Set((old ?? []).filter((o) => o.checked).map((o) => o.food_key ?? o.name));
  await supabase.from("grocery_items").delete().eq("list_id", list!.id);
  if (items.length)
    await supabase.from("grocery_items").insert(
      items.map((i) => ({ list_id: list!.id, food_key: i.key, name: i.name, grams: i.grams, qty: i.qty, unit: i.unit, aisle: i.aisle, is_staple: i.isStaple, checked: checked.has(i.key) })),
    );
  revalidatePath("/grocery");
  return { ok: true, note: await playfulNote(supabase, uid, today, "grocery_ready", "Grocery list ready.") };
}

export async function toggleGroceryItem(itemId: string, checked: boolean): Promise<ActionResult> {
  const { supabase } = await requireMember();
  await supabase.from("grocery_items").update({ checked }).eq("id", z.uuid().parse(itemId));
  return { ok: true };
}

/**
 * M6-01: delete account. Removes storage objects first (FK cascade doesn't reach Storage),
 * then the auth user, which cascades to every table via ON DELETE CASCADE.
 */
export async function deleteAccount(_prev: unknown, form: FormData): Promise<ActionResult> {
  const { uid, profile } = await requireMember({ allowOnboarding: true });
  if (String(form.get("confirm") ?? "").trim() !== "DELETE") return { ok: false, error: 'Type DELETE to confirm.' };
  const admin = createAdminClient();
  for (const bucket of ["meal-photos", "avatars"]) {
    for (;;) {
      const { data } = await admin.storage.from(bucket).list(uid, { limit: 100 });
      if (!data?.length) break;
      await admin.storage.from(bucket).remove(data.map((f) => `${uid}/${f.name}`));
      if (data.length < 100) break;
    }
  }
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return { ok: false, error: `Couldn't delete the account (${profile.display_name}). Please contact the owner.` };
  redirect("/login?deleted=1");
}
