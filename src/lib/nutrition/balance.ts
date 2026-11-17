/**
 * Daily balance & safety rails (NUTRITION_RULES §6, §7).
 */

export interface DayTotals {
  date: string; // YYYY-MM-DD
  intakeKcal: number;
  proteinG: number;
  activeKcal: number | null;
  totalKcalBurn: number | null; // phase 2 / manual optional
  mealsLogged: number;
}

export interface Balance {
  intakeKcal: number;
  restingKcal: number;
  activeKcal: number;
  burnKcal: number;
  net: number;
  restingIsEstimate: boolean;
}

/** net = intake − (resting + active). Resting = BMR estimate unless a total burn is known. */
export function dailyBalance(day: DayTotals, bmr: number): Balance {
  const active = day.activeKcal ?? 0;
  if (day.totalKcalBurn != null && day.totalKcalBurn > 0) {
    return {
      intakeKcal: day.intakeKcal,
      restingKcal: Math.max(0, day.totalKcalBurn - active),
      activeKcal: active,
      burnKcal: day.totalKcalBurn,
      net: Math.round(day.intakeKcal - day.totalKcalBurn),
      restingIsEstimate: false,
    };
  }
  const resting = Math.round(bmr);
  return {
    intakeKcal: day.intakeKcal,
    restingKcal: resting,
    activeKcal: active,
    burnKcal: resting + active,
    net: Math.round(day.intakeKcal - (resting + active)),
    restingIsEstimate: true,
  };
}

/** ASSUMPTION threshold (NUTRITION_RULES §7): < 1,000 kcal on 3 consecutive logged days. */
export const SAFETY_KCAL_THRESHOLD = 1000;
export const SAFETY_CONSECUTIVE_DAYS = 3;

/**
 * Safety mode: the most recent N consecutive days (ending yesterday or today) all have
 * at least one log and intake below the threshold. Days without logs break the run —
 * we don't treat "didn't log" as "didn't eat".
 */
export function isSafetyMode(days: DayTotals[], today: string): boolean {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const check = (endOffset: number) => {
    for (let i = 0; i < SAFETY_CONSECUTIVE_DAYS; i++) {
      const d = byDate.get(addDays(today, -(i + endOffset)));
      if (!d || d.mealsLogged === 0 || d.intakeKcal >= SAFETY_KCAL_THRESHOLD) return false;
    }
    return true;
  };
  // today is often incomplete, so evaluate the run ending yesterday
  return check(1);
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calendar date (YYYY-MM-DD) in a given IANA timezone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Minutes since local midnight in a timezone. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** ISO weekday 1 (Mon) … 7 (Sun) for a YYYY-MM-DD date. */
export function isoWeekday(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday of the week containing isoDate. */
export function weekStart(isoDate: string): string {
  return addDays(isoDate, -(isoWeekday(isoDate) - 1));
}
