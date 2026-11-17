/**
 * Leaderboard scoring — DECISIONS D-015 / PRODUCT_BRIEF §7.
 * Points are % of the person's OWN goal, capped, so body size doesn't decide the winner.
 */

export const MOVE_CAP = 200;
export const PROTEIN_CAP = 100;
export const PHOTO_LOG_POINTS = 20;
export const PHOTO_LOG_MAX = 2;
export const STREAK_BONUS = 10;
export const DAILY_CAP = MOVE_CAP + PROTEIN_CAP + PHOTO_LOG_POINTS * PHOTO_LOG_MAX + STREAK_BONUS; // 350
/** Manual entries > 2× personal 30-day median are flagged (PRODUCT_BRIEF §7). */
export const FLAG_MULTIPLIER = 2;

export interface WeeklyGoals {
  activeKcalGoal: number;
  proteinTargetG: number;
}

export interface DayActivity {
  activeKcal: number;
  proteinG: number;
  photoLogs: number;
  /** Did the user log at least one meal on each of the previous day(s) AND today? */
  streakActive: boolean;
}

export interface DailyPoints {
  movePts: number;
  proteinPts: number;
  loggingPts: number;
  total: number;
}

function pct(value: number, goal: number): number {
  if (!(goal > 0) || !(value > 0)) return 0;
  return Math.floor((value / goal) * 100);
}

export function dailyPoints(day: DayActivity, goals: WeeklyGoals): DailyPoints {
  const movePts = Math.min(MOVE_CAP, pct(day.activeKcal, goals.activeKcalGoal));
  const proteinPts = Math.min(PROTEIN_CAP, pct(day.proteinG, goals.proteinTargetG));
  const loggingPts = Math.min(PHOTO_LOG_MAX, Math.max(0, Math.floor(day.photoLogs))) * PHOTO_LOG_POINTS + (day.streakActive ? STREAK_BONUS : 0);
  const total = Math.min(DAILY_CAP, movePts + proteinPts + loggingPts);
  return { movePts, proteinPts, loggingPts, total };
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Flag an unusual manual burn entry. Needs ≥ 7 prior entries to have a meaningful median (ASSUMPTION). */
export function shouldFlagManualBurn(activeKcal: number, last30Days: number[]): boolean {
  if (last30Days.length < 7) return false;
  const m = median(last30Days);
  return m != null && m > 0 && activeKcal > FLAG_MULTIPLIER * m;
}

/** Current streak length (consecutive days with ≥ 1 meal logged, ending today or yesterday). */
export function streakLength(loggedDates: Set<string>, today: string, addDays: (d: string, n: number) => string): number {
  let start = today;
  if (!loggedDates.has(today)) start = addDays(today, -1);
  let n = 0;
  while (loggedDates.has(addDays(start, -n))) n++;
  return n;
}

export interface BoardRow {
  userId: string;
  total: number;
  displayName: string;
}

/** Rank with ties sharing a position (1, 2, 2, 4). */
export function rank<T extends { total: number }>(rows: T[]): (T & { position: number })[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  let pos = 0;
  let prev: number | null = null;
  return sorted.map((r, i) => {
    if (r.total !== prev) pos = i + 1;
    prev = r.total;
    return { ...r, position: pos };
  });
}
