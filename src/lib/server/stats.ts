import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, type DayTotals } from "@/lib/nutrition/balance";

/** Per-day intake/protein/burn for [from, to] inclusive (own data via RLS). */
export async function dayTotals(supabase: SupabaseClient, uid: string, from: string, to: string): Promise<DayTotals[]> {
  const [{ data: logs }, { data: burn }] = await Promise.all([
    supabase.from("meal_logs").select("date, kcal, protein_g").eq("user_id", uid).gte("date", from).lte("date", to),
    supabase.from("activity_logs").select("date, active_kcal, total_kcal").eq("user_id", uid).gte("date", from).lte("date", to),
  ]);
  const map = new Map<string, DayTotals>();
  for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, { date: d, intakeKcal: 0, proteinG: 0, activeKcal: null, totalKcalBurn: null, mealsLogged: 0 });
  for (const l of logs ?? []) {
    const t = map.get(l.date)!;
    t.intakeKcal += l.kcal;
    t.proteinG += Number(l.protein_g);
    t.mealsLogged++;
  }
  for (const b of burn ?? []) {
    const t = map.get(b.date)!;
    t.activeKcal = (t.activeKcal ?? 0) + b.active_kcal;
    if (b.total_kcal) t.totalKcalBurn = b.total_kcal;
  }
  return [...map.values()];
}

export type SlotRow = {
  id: string;
  date: string;
  meal_type: "lunch" | "dinner";
  status: string;
  servings: number;
  recipe: { id: string; title: string; per_serving_kcal: number; per_serving_protein_g: number; cook_minutes: number; nutrition_status: string; why: string | null } | null;
};

export async function slotsBetween(supabase: SupabaseClient, uid: string, from: string, to: string): Promise<SlotRow[]> {
  const { data } = await supabase
    .from("meal_plan_slots")
    .select("id, date, meal_type, status, servings, recipe:recipes(id, title, per_serving_kcal, per_serving_protein_g, cook_minutes, nutrition_status, why), meal_plans!inner(user_id)")
    .eq("meal_plans.user_id", uid)
    .gte("date", from)
    .lte("date", to)
    .order("date");
  return (data ?? []) as unknown as SlotRow[];
}
