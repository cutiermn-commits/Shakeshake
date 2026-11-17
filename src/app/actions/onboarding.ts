"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CONSENT_VERSION, getUserId, type ConsentPurpose } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { ageFromBirthYear, manualKcalWarning, suggestTargets } from "@/lib/nutrition/targets";
import type { FormState } from "./auth";

const list = z
  .string()
  .max(500)
  .transform((s) =>
    s
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20),
  );

const OnboardingSchema = z.object({
  display_name: z.string().trim().min(1).max(40),
  city: z.string().trim().max(60).optional().default(""),
  avatar_preset: z.string().max(20).optional().default("idli"),
  birth_year: z.coerce.number().int().min(1925).max(new Date().getFullYear() - 18),
  sex: z.enum(["female", "male"]),
  height_cm: z.coerce.number().min(120).max(230),
  weight_kg: z.coerce.number().min(30).max(250),
  activity_level: z.enum(["sedentary", "light", "moderate", "very_active", "extra_active"]),
  goal: z.enum(["lose", "maintain", "gain", "recomposition"]),
  medical_flag: z.coerce.boolean().default(false),
  diet_type: z.enum(["nonveg", "egg", "veg"]),
  spice_level: z.enum(["mild", "medium", "hot"]),
  max_cook_minutes: z.coerce.number().int().min(10).max(240),
  regions: z.array(z.enum(["tamil", "kerala", "andhra", "karnataka", "telangana", "mixed"])).min(1),
  allergies: list,
  dislikes: list,
  lunch_time: z.string().regex(/^\d{2}:\d{2}$/),
  dinner_time: z.string().regex(/^\d{2}:\d{2}$/),
  indian_adjusted: z.coerce.boolean().default(false),
  kcal_min: z.coerce.number().int().min(800).max(6000),
  kcal_max: z.coerce.number().int().min(800).max(6000),
  protein_g_min: z.coerce.number().int().min(10).max(400),
  protein_g_max: z.coerce.number().int().min(10).max(400),
  active_kcal_goal: z.coerce.number().int().min(50).max(3000),
  consent_health_data: z.literal("on"),
  consent_ai_processing: z.string().optional(),
  consent_social_sharing: z.string().optional(),
  accept_disclaimer: z.literal("on"),
});

/** Onboarding (J1, M1-03/04/05): profile, health profile, targets and consents in one submit. */
export async function completeOnboarding(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form.entries());
  const parsed = OnboardingSchema.safeParse({ ...raw, regions: form.getAll("regions"), medical_flag: form.get("medical_flag") === "on", indian_adjusted: form.get("indian_adjusted") === "on" });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first?.path[0] === "consent_health_data") return { error: "We need your OK to store health details — otherwise targets can't be suggested." };
    if (first?.path[0] === "accept_disclaimer") return { error: "Please confirm you understand this isn't medical advice." };
    return { error: `Please check “${String(first?.path[0] ?? "the form").replaceAll("_", " ")}”.` };
  }
  const v = parsed.data;
  if (v.kcal_min > v.kcal_max || v.protein_g_min > v.protein_g_max) return { error: "Minimum values must be below maximum values." };

  const uid = await getUserId();
  if (!uid) redirect("/login");
  const supabase = await createClient();

  // Consents first — health writes are gated by RLS on health_data consent.
  const consents: [ConsentPurpose, boolean][] = [
    ["health_data", true],
    ["ai_processing", v.consent_ai_processing === "on"],
    ["social_sharing", v.consent_social_sharing === "on"],
  ];
  const now = new Date().toISOString();
  const { error: cErr } = await supabase
    .from("consents")
    .insert(consents.map(([purpose, granted]) => ({ user_id: uid, purpose, granted, version: CONSENT_VERSION, granted_at: granted ? now : null, revoked_at: granted ? null : now })));
  if (cErr) return { error: "Couldn't save your choices. Please try again." };

  const { error: pErr } = await supabase
    .from("profiles")
    .update({
      display_name: v.display_name,
      city: v.city || null,
      avatar_preset: v.avatar_preset,
      diet_type: v.diet_type,
      spice_level: v.spice_level,
      max_cook_minutes: v.max_cook_minutes,
      regions: v.regions,
      lunch_time: v.lunch_time,
      dinner_time: v.dinner_time,
    })
    .eq("id", uid);
  if (pErr) return { error: "Couldn't save your profile. Please try again." };

  const { error: hErr } = await supabase.from("health_profile").upsert({
    user_id: uid,
    birth_year: v.birth_year,
    sex: v.sex,
    height_cm: v.height_cm,
    weight_kg: v.weight_kg,
    activity_level: v.activity_level,
    goal: v.goal,
    allergies: v.allergies,
    dislikes: v.dislikes,
    medical_flag: v.medical_flag,
    updated_at: now,
  });
  if (hErr) return { error: "Couldn't save your health details. Please try again." };

  const s = suggestTargets({
    sex: v.sex,
    weightKg: v.weight_kg,
    heightCm: v.height_cm,
    age: ageFromBirthYear(v.birth_year),
    activity: v.activity_level,
    goal: v.goal,
    indianAdjusted: v.indian_adjusted,
    medicalFlag: v.medical_flag,
  });
  const overridden = v.kcal_min !== s.kcalMin || v.kcal_max !== s.kcalMax || v.protein_g_min !== s.proteinGMin || v.protein_g_max !== s.proteinGMax;
  const { error: tErr } = await supabase.from("targets").upsert(
    {
      user_id: uid,
      effective_from: new Date().toISOString().slice(0, 10),
      kcal_min: v.kcal_min,
      kcal_max: v.kcal_max,
      protein_g_min: v.protein_g_min,
      protein_g_max: v.protein_g_max,
      active_kcal_goal: v.active_kcal_goal,
      bmr: s.bmr,
      method: overridden ? `User-set (suggested: ${s.method})` : s.method,
      source_note: s.sourceNote,
      user_overridden: overridden,
    },
    { onConflict: "user_id,effective_from" },
  );
  if (tErr) return { error: "Couldn't save your targets. Please try again." };

  await supabase.from("profiles").update({ onboarded: true }).eq("id", uid);
  revalidatePath("/", "layout");
  const warn = manualKcalWarning(v.kcal_min, s.bmr);
  redirect(warn ? "/today?low_kcal=1" : "/today?welcome=1");
}
