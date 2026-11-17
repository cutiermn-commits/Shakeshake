import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { addDays, weekStart } from "@/lib/nutrition/balance";
import { dailyPoints, shouldFlagManualBurn, streakLength } from "@/lib/leaderboard/score";

/**
 * Recompute one user's leaderboard_daily row for a date (D-015). Runs with the service role
 * because leaderboard_daily / weekly_goals are server-written only (ARCHITECTURE §5 RLS sketch).
 * Goals are snapshotted per week on first scoring → locked for that competition week.
 */
export async function refreshDailyScore(userId: string, date: string): Promise<void> {
  if (!process.env.SUPABASE_SECRET_KEY) return; // not configured (local dev without service key)
  const admin = createAdminClient();
  const ws = weekStart(date);

  let { data: goals } = await admin.from("weekly_goals").select("*").eq("user_id", userId).eq("week_start", ws).maybeSingle();
  if (!goals) {
    const { data: t } = await admin
      .from("targets")
      .select("active_kcal_goal, protein_g_min, protein_g_max")
      .eq("user_id", userId)
      .lte("effective_from", date)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    const protein = t?.protein_g_min && t?.protein_g_max ? Math.round((t.protein_g_min + t.protein_g_max) / 2) : t?.protein_g_min ?? 0;
    const row = { user_id: userId, week_start: ws, active_kcal_goal: t?.active_kcal_goal ?? 400, protein_target_g: protein || 60 };
    await admin.from("weekly_goals").upsert(row, { onConflict: "user_id,week_start", ignoreDuplicates: true });
    ({ data: goals } = await admin.from("weekly_goals").select("*").eq("user_id", userId).eq("week_start", ws).single());
  }

  const [{ data: logs }, { data: burn }, { data: history }, { data: recentLogDates }] = await Promise.all([
    admin.from("meal_logs").select("protein_g, photo_path").eq("user_id", userId).eq("date", date),
    admin.from("activity_logs").select("id, active_kcal, source, flagged").eq("user_id", userId).eq("date", date),
    admin.from("activity_logs").select("active_kcal").eq("user_id", userId).lt("date", date).gte("date", addDays(date, -30)),
    admin.from("meal_logs").select("date").eq("user_id", userId).gte("date", addDays(date, -60)).lte("date", date),
  ]);

  const active = (burn ?? []).reduce((s, b) => s + (b.active_kcal ?? 0), 0);
  const manual = (burn ?? []).find((b) => b.source === "manual");
  const flagged = manual ? shouldFlagManualBurn(manual.active_kcal, (history ?? []).map((h) => h.active_kcal)) : false;
  if (manual && manual.flagged !== flagged) await admin.from("activity_logs").update({ flagged }).eq("id", manual.id);

  const dates = new Set((recentLogDates ?? []).map((r) => r.date as string));
  const streak = streakLength(dates, date, addDays);
  const pts = dailyPoints(
    {
      activeKcal: active,
      proteinG: (logs ?? []).reduce((s, l) => s + Number(l.protein_g ?? 0), 0),
      photoLogs: (logs ?? []).filter((l) => l.photo_path).length,
      streakActive: dates.has(date) && streak >= 2,
    },
    { activeKcalGoal: goals!.active_kcal_goal, proteinTargetG: goals!.protein_target_g },
  );
  await admin.from("leaderboard_daily").upsert(
    { user_id: userId, date, move_pts: pts.movePts, protein_pts: pts.proteinPts, logging_pts: pts.loggingPts, total: pts.total, flagged, updated_at: new Date().toISOString() },
    { onConflict: "user_id,date" },
  );
}
