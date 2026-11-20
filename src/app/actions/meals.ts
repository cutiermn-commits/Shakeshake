"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getHealthProfile, getTargets, requireMember } from "@/lib/server/dal";
import { planWeek, suggestFor, swapOptions, type MealType } from "@/lib/server/meals";
import { failureCopy } from "@/lib/ai/gateway";
import { playfulNote } from "@/lib/server/notes";

export type ActionResult<T = undefined> = { ok: true; data?: T; note?: string } | { ok: false; error: string };

const Meal = z.enum(["lunch", "dinner"]);

/** Never let an unexpected error end silently on the phone: log it (Vercel → Logs) and return a friendly message. */
async function safe<T>(label: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    // redirect()/notFound() throw control-flow errors that Next.js must handle — rethrow those.
    if (e && typeof e === "object" && "digest" in e && /NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(String((e as { digest: unknown }).digest))) throw e;
    console.error(`[action] ${label} failed`, e);
    return { ok: false, error: "Our AI chef dropped the ladle. Try again, or log it manually." };
  }
}
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function suggestMeal(mealType: MealType, date?: string): Promise<ActionResult> {
  const { uid, profile, supabase, today } = await requireMember();
  return safe("suggestMeal", async () => {
    const m = Meal.parse(mealType);
    const d = date ? DateStr.parse(date) : today;
    const out = await suggestFor(supabase, uid, profile, await getHealthProfile(), await getTargets(), d, m);
    revalidatePath("/today");
    revalidatePath("/plan");
    if (!out.ids.length) {
      if (out.failure) return { ok: false, error: failureCopy(out.failure.reason) };
      if (out.filteredOut)
        return { ok: false, error: "The ideas we got clashed with your allergies, dislikes or diet, so we hid them. Tap again for fresh ones." };
      return { ok: false, error: "No recipe ideas yet — try again shortly or log manually." };
    }
    return { ok: true, note: out.source === "cache" && out.failure ? `${failureCopy(out.failure.reason)} Here's a saved favourite meanwhile.` : undefined };
  });
}

const SwapReason = z.enum(["more_protein", "faster", "different_protein", "veg", "any"]);

export type SwapOption = {
  id: string;
  title: string;
  per_serving_kcal: number;
  per_serving_protein_g: number;
  cook_minutes: number;
  nutrition_status: string;
  why: string | null;
};

/** M2-06: three alternatives for a slot. Nothing changes until the user picks one. */
export async function getSwapOptions(slotId: string, reason: z.infer<typeof SwapReason>): Promise<ActionResult<SwapOption[]>> {
  const { uid, profile, supabase } = await requireMember();
  return safe("getSwapOptions", async () => {
    const r = SwapReason.parse(reason);
    const { data: slot } = await supabase.from("meal_plan_slots").select("id, meal_type, recipe_id, recipes(title)").eq("id", z.uuid().parse(slotId)).single();
    if (!slot) return { ok: false, error: "That meal slot wasn't found." };
    const title = (slot.recipes as unknown as { title: string } | null)?.title ?? "today's meal";
    const out = await swapOptions(supabase, uid, profile, await getHealthProfile(), await getTargets(), slot.meal_type as MealType, title, slot.recipe_id, r);
    if (!out.ids.length) return { ok: false, error: out.failure ? failureCopy(out.failure.reason) : "No alternatives right now — try again shortly." };
    const { data } = await supabase
      .from("recipes")
      .select("id, title, per_serving_kcal, per_serving_protein_g, cook_minutes, nutrition_status, why")
      .in("id", out.ids);
    return { ok: true, data: (data ?? []) as SwapOption[], note: out.source === "cache" ? "From your saved recipes (AI is resting)." : undefined };
  });
}

export async function applySwap(slotId: string, recipeId: string): Promise<ActionResult> {
  const { uid, supabase, today } = await requireMember();
  const { error } = await supabase
    .from("meal_plan_slots")
    .update({ recipe_id: z.uuid().parse(recipeId), status: "swapped", remind_at: null })
    .eq("id", z.uuid().parse(slotId));
  if (error) return { ok: false, error: "Couldn't swap — please try again." };
  revalidatePath("/today");
  revalidatePath("/plan");
  return { ok: true, note: await playfulNote(supabase, uid, today, "swap", "Swapped.") };
}

/** M2-08: choosing schedules the plate reminder at meal time + offset (dispatcher sends it). */
export async function chooseMeal(slotId: string): Promise<ActionResult> {
  const { uid, supabase, profile, today } = await requireMember();
  const { data: slot } = await supabase.from("meal_plan_slots").select("id, date, meal_type").eq("id", z.uuid().parse(slotId)).single();
  if (!slot) return { ok: false, error: "That meal slot wasn't found." };
  const time = slot.meal_type === "lunch" ? profile.lunch_time : profile.dinner_time;
  const offset = Number(process.env.PLATE_REMINDER_OFFSET_MIN ?? 30);
  // remind_at is informational (the dispatcher computes due times in the user's timezone).
  const [h, m] = time.split(":").map(Number);
  const remind = new Date(`${slot.date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`);
  remind.setMinutes(remind.getMinutes() + offset);
  const { error } = await supabase.from("meal_plan_slots").update({ status: "chosen", remind_at: remind.toISOString() }).eq("id", slot.id);
  if (error) return { ok: false, error: "Couldn't save your choice." };
  revalidatePath("/today");
  revalidatePath("/plan");
  return { ok: true, note: await playfulNote(supabase, uid, today, "chosen", "Saved. We'll remind you to log your plate.") };
}

export async function skipMeal(slotId: string): Promise<ActionResult> {
  const { supabase } = await requireMember();
  await supabase.from("meal_plan_slots").update({ status: "skipped", remind_at: null }).eq("id", z.uuid().parse(slotId));
  revalidatePath("/today");
  revalidatePath("/plan");
  return { ok: true };
}

export async function setSlotServings(slotId: string, servings: number): Promise<ActionResult> {
  const { supabase } = await requireMember();
  await supabase
    .from("meal_plan_slots")
    .update({ servings: z.number().int().min(1).max(8).parse(servings) })
    .eq("id", z.uuid().parse(slotId));
  revalidatePath("/plan");
  revalidatePath("/grocery");
  return { ok: true };
}

/** M4-01: plan the week containing `date` (defaults to next Monday on Sundays). */
export async function planMyWeek(weekOf?: string): Promise<ActionResult> {
  const { uid, profile, supabase, today } = await requireMember();
  return safe("planMyWeek", async () => {
    const d = weekOf ? DateStr.parse(weekOf) : today;
    const res = await planWeek(supabase, uid, profile, await getHealthProfile(), await getTargets(), d);
    revalidatePath("/plan");
    const failed = Object.values(res).find((r) => !r.ids.length);
    if (failed && failed.failure) return { ok: false, error: failureCopy(failed.failure.reason) };
    const cached = Object.values(res).some((r) => r.source === "cache");
    const done = await playfulNote(supabase, uid, today, "weekly_plan", "Your week is planned.");
    return { ok: true, note: cached ? `${done} Some days use saved recipes while the AI chef rests.` : done };
  });
}
