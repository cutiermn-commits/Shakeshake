"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireMember } from "@/lib/server/dal";
import { gatewayDeps } from "@/lib/server/meals";
import { failureCopy, runAi } from "@/lib/ai/gateway";
import { PlateEstimateSchema, type PlateEstimate } from "@/lib/ai/schemas";
import { platePrompt } from "@/lib/ai/prompts";
import { refreshDailyScore } from "@/lib/server/scoring";
import { playfulNote } from "@/lib/server/notes";
import type { ActionResult } from "./meals";

const MAX_IMAGE_B64 = 420_000; // ≈ 300 KB binary — client compresses to ≤ ~150 KB

/** M3-02: AI plate estimate. Requires ai_processing consent (enforced in the gateway). */
export async function estimatePlate(input: { imageBase64: string; recipeId?: string; vessel?: "plate" | "bowl" | "banana_leaf" | "thali" }): Promise<ActionResult<PlateEstimate & { recipe?: { id: string; title: string; kcal: number; protein: number } }>> {
  const { uid, supabase } = await requireMember();
  if (!input.imageBase64 || input.imageBase64.length > MAX_IMAGE_B64) return { ok: false, error: "That photo is too large — please try again." };
  let recipe: { id: string; title: string; kcal: number; protein: number } | undefined;
  if (input.recipeId) {
    const { data } = await supabase.from("recipes").select("id, title, per_serving_kcal, per_serving_protein_g").eq("id", z.uuid().parse(input.recipeId)).maybeSingle();
    if (data) recipe = { id: data.id, title: data.title, kcal: data.per_serving_kcal, protein: Number(data.per_serving_protein_g) };
  }
  const res = await runAi(gatewayDeps(supabase), {
    userId: uid,
    kind: "plate",
    prompt: platePrompt({ recipeTitle: recipe?.title, vessel: input.vessel }),
    schema: PlateEstimateSchema,
    image: { mimeType: "image/jpeg", dataBase64: input.imageBase64 },
  });
  if (!res.ok) return { ok: false, error: failureCopy(res.reason) };
  return { ok: true, data: { ...res.data, recipe } };
}

const LogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  dish: z.string().trim().min(1).max(80),
  kcal: z.coerce.number().int().min(0).max(5000),
  protein_g: z.coerce.number().min(0).max(400),
  recipe_id: z.uuid().optional().nullable(),
  photo_path: z.string().max(200).optional().nullable(),
  ai_estimate: z.unknown().optional().nullable(),
  portion_factor: z.coerce.number().min(0.5).max(2).optional().nullable(),
  source: z.enum(["ai", "ai_corrected", "manual", "recipe"]),
  visibility: z.enum(["friends", "private"]).default("friends"),
});

/** M3-03 / M3-04: save the confirmed values (AI estimate kept separately for evaluation). */
export async function saveMealLog(input: z.input<typeof LogSchema>): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const parsed = LogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the dish name and numbers." };
  const v = parsed.data;
  if (v.photo_path && !v.photo_path.startsWith(`${uid}/`)) return { ok: false, error: "Invalid photo." };
  const { error } = await supabase.from("meal_logs").insert({ ...v, user_id: uid, ai_estimate: v.ai_estimate ?? null });
  if (error) return { ok: false, error: "Couldn't save that meal. Please try again." };
  if (v.recipe_id && (v.meal_type === "lunch" || v.meal_type === "dinner")) {
    // mark the planned slot as chosen if it wasn't
    const { data: slots } = await supabase.from("meal_plan_slots").select("id, meal_plans!inner(user_id)").eq("meal_plans.user_id", uid).eq("date", v.date).eq("meal_type", v.meal_type);
    if (slots?.[0]) await supabase.from("meal_plan_slots").update({ status: "chosen" }).eq("id", slots[0].id);
  }
  after(() => refreshDailyScore(uid, v.date));
  revalidatePath("/today");
  revalidatePath("/dashboard");
  revalidatePath("/feed");
  return { ok: true, note: await playfulNote(supabase, uid, v.date, "logged_thanks", "Saved.") };
}

export async function deleteMealLog(id: string): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const { data } = await supabase.from("meal_logs").delete().eq("id", z.uuid().parse(id)).eq("user_id", uid).select("date, photo_path").maybeSingle();
  if (data?.photo_path) await supabase.storage.from("meal-photos").remove([data.photo_path]);
  if (data) after(() => refreshDailyScore(uid, data.date));
  revalidatePath("/dashboard");
  revalidatePath("/feed");
  return { ok: true };
}

export async function setLogVisibility(id: string, visibility: "friends" | "private"): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  await supabase.from("meal_logs").update({ visibility: z.enum(["friends", "private"]).parse(visibility) }).eq("id", z.uuid().parse(id)).eq("user_id", uid);
  revalidatePath("/dashboard");
  revalidatePath("/feed");
  return { ok: true };
}

const BurnSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  active_kcal: z.coerce.number().int().min(0).max(6000),
  total_kcal: z.coerce.number().int().min(0).max(10000).optional().nullable(),
});

/** M3-05: one entry per day (upsert); edits are kept in activity_log_edits by trigger. */
export async function saveBurn(input: z.input<typeof BurnSchema>): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const parsed = BurnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please enter a number between 0 and 6000." };
  const v = parsed.data;
  const { error } = await supabase
    .from("activity_logs")
    .upsert({ user_id: uid, date: v.date, active_kcal: v.active_kcal, total_kcal: v.total_kcal || null, source: "manual" }, { onConflict: "user_id,date,source" });
  if (error) return { ok: false, error: "Couldn't save your burn. Please try again." };
  after(() => refreshDailyScore(uid, v.date));
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  return { ok: true, note: await playfulNote(supabase, uid, v.date, "burn_logged", "Saved.") };
}
