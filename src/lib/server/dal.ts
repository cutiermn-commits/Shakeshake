import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/nutrition/balance";

export type Profile = {
  id: string;
  display_name: string;
  avatar_path: string | null;
  avatar_preset: string | null;
  city: string | null;
  timezone: string;
  diet_type: "nonveg" | "egg" | "veg";
  spice_level: "mild" | "medium" | "hot";
  max_cook_minutes: number;
  regions: string[];
  lunch_time: string;
  dinner_time: string;
  muted_categories: string[];
  friend_code: string;
  onboarded: boolean;
};

export type HealthProfile = {
  birth_year: number | null;
  sex: "female" | "male" | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: string | null;
  goal: string | null;
  allergies: string[];
  dislikes: string[];
  medical_flag: boolean;
};

export type Targets = {
  kcal_min: number;
  kcal_max: number;
  protein_g_min: number | null;
  protein_g_max: number | null;
  active_kcal_goal: number;
  bmr: number | null;
  method: string;
  source_note: string;
  user_overridden: boolean;
  effective_from: string;
};

export type ConsentPurpose = "health_data" | "ai_processing" | "social_sharing" | "marketing_push";
export const CONSENT_VERSION = "2026-11-17";

/** Verified identity from the JWT (getClaims verifies the signature). Data Access Layer pattern. */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
});

export const isAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const meta = data?.claims?.app_metadata as { role?: string } | undefined;
  return meta?.role === "admin";
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const uid = await getUserId();
  if (!uid) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  return (data as Profile) ?? null;
});

/** For app pages: signed in, invite redeemed, onboarding done. */
export async function requireMember(opts: { allowOnboarding?: boolean } = {}) {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const profile = await getProfile();
  if (!profile) redirect("/welcome");
  if (!profile.onboarded && !opts.allowOnboarding) redirect("/onboarding");
  const supabase = await createClient();
  const today = localDate(new Date(), profile.timezone || "Asia/Kolkata");
  return { uid, profile, supabase, today };
}

export const getHealthProfile = cache(async (): Promise<HealthProfile | null> => {
  const uid = await getUserId();
  if (!uid) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("health_profile").select("*").eq("user_id", uid).maybeSingle();
  return (data as HealthProfile) ?? null;
});

export const getTargets = cache(async (): Promise<Targets | null> => {
  const uid = await getUserId();
  if (!uid) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("targets")
    .select("*")
    .eq("user_id", uid)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Targets) ?? null;
});

export const getConsents = cache(async (): Promise<Record<ConsentPurpose, boolean>> => {
  const uid = await getUserId();
  const out: Record<ConsentPurpose, boolean> = { health_data: false, ai_processing: false, social_sharing: false, marketing_push: false };
  if (!uid) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("consents").select("purpose, granted, created_at").eq("user_id", uid).order("created_at", { ascending: true });
  for (const row of (data ?? []) as { purpose: ConsentPurpose; granted: boolean }[]) out[row.purpose] = row.granted;
  return out;
});
