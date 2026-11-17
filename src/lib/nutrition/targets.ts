/**
 * Daily target suggestion — docs/NUTRITION_RULES.md §2.
 * Pure functions, no I/O. These are suggestions, not medical advice.
 */

export type Sex = "female" | "male";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active" | "extra_active";
export type Goal = "lose" | "maintain" | "gain" | "recomposition";

/** DOCUMENTED standard activity factors (NUTRITION_RULES §2.1). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

/**
 * Goal multipliers applied to TDEE (NUTRITION_RULES §2.1 — ASSUMPTION, confirm with a dietitian).
 * `recomposition` is not defined in NUTRITION_RULES; ASSUMPTION: a mild deficit (−10 % … 0 %).
 * Logged as a gap in DECISIONS (D-022).
 */
export const GOAL_MULTIPLIERS: Record<Goal, [number, number]> = {
  lose: [0.8, 0.9],
  maintain: [0.95, 1.05],
  gain: [1.05, 1.1],
  recomposition: [0.9, 1.0],
};

/** Protein ranges in g/kg/day (NUTRITION_RULES §2.2). */
export const PROTEIN_RANGES = {
  rda_floor: [0.83, 1.0] as [number, number], // VERIFIED floor 0.83 (ICMR-NIN 2020); upper bound ASSUMPTION
  regular_exercise: [1.0, 1.2] as [number, number], // DOCUMENTED
  training: [1.6, 2.2] as [number, number], // DOCUMENTED (ISSN 2017, via secondary)
};

export const INDIAN_BMR_ADJUSTMENT = 0.95; // −5 % option (NUTRITION_RULES §2.1, ASSUMPTION as applied to Mifflin)

export interface BodyInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}

export interface TargetInput extends BodyInput {
  activity: ActivityLevel;
  goal: Goal;
  indianAdjusted?: boolean;
  /** "Doctor limits protein / pregnant / breastfeeding" (NUTRITION_RULES §2.2). */
  medicalFlag?: boolean;
}

export interface TargetSuggestion {
  bmr: number;
  tdee: number;
  kcalMin: number;
  kcalMax: number;
  /** null when medicalFlag is set — user must enter the doctor's target. */
  proteinGMin: number | null;
  proteinGMax: number | null;
  proteinBasis: keyof typeof PROTEIN_RANGES | "doctor";
  method: string;
  sourceNote: string;
  warnings: string[];
}

export function validateBody(b: BodyInput): string[] {
  const errors: string[] = [];
  if (!(b.weightKg >= 30 && b.weightKg <= 250)) errors.push("Weight must be between 30 and 250 kg.");
  if (!(b.heightCm >= 120 && b.heightCm <= 230)) errors.push("Height must be between 120 and 230 cm.");
  if (!(b.age >= 18 && b.age <= 100)) errors.push("Age must be between 18 and 100.");
  return errors;
}

/** Mifflin-St Jeor BMR in kcal/day. */
export function bmrMifflinStJeor({ sex, weightKg, heightCm, age }: BodyInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "female" ? base - 161 : base + 5;
}

export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear;
}

function proteinBasisFor(activity: ActivityLevel, goal: Goal): keyof typeof PROTEIN_RANGES {
  // ASSUMPTION mapping (NUTRITION_RULES §2.2 gives ranges, not the mapping):
  // training range when active (moderate+) AND pursuing a change (lose/gain/recomp) or very active.
  if (activity === "very_active" || activity === "extra_active") return "training";
  if (activity === "moderate" && goal !== "maintain") return "training";
  if (activity === "sedentary") return "rda_floor";
  return "regular_exercise";
}

const round = (n: number, step = 1) => Math.round(n / step) * step;

export function suggestTargets(input: TargetInput): TargetSuggestion {
  const errors = validateBody(input);
  if (errors.length) throw new RangeError(errors.join(" "));

  const rawBmr = bmrMifflinStJeor(input);
  const bmr = input.indianAdjusted ? rawBmr * INDIAN_BMR_ADJUSTMENT : rawBmr;
  const tdee = bmr * ACTIVITY_FACTORS[input.activity];
  const [lo, hi] = GOAL_MULTIPLIERS[input.goal];
  const warnings: string[] = [];

  let kcalMin = tdee * lo;
  const kcalMax = Math.max(tdee * hi, bmr);
  if (kcalMin < bmr) {
    // Floor: never suggest below BMR (NUTRITION_RULES §2.1).
    kcalMin = bmr;
    warnings.push("Suggestion raised to your estimated BMR — we never suggest eating below it.");
  }

  let proteinGMin: number | null = null;
  let proteinGMax: number | null = null;
  let proteinBasis: TargetSuggestion["proteinBasis"] = "doctor";
  if (!input.medicalFlag) {
    proteinBasis = proteinBasisFor(input.activity, input.goal);
    const [pLo, pHi] = PROTEIN_RANGES[proteinBasis];
    proteinGMin = round(input.weightKg * pLo);
    proteinGMax = round(input.weightKg * pHi);
  } else {
    warnings.push("Please follow your doctor's protein target and enter it below.");
  }

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    kcalMin: round(kcalMin, 10),
    kcalMax: round(kcalMax, 10),
    proteinGMin,
    proteinGMax,
    proteinBasis,
    method: `Mifflin-St Jeor${input.indianAdjusted ? " (Indian-adjusted −5 %)" : ""} × activity ${ACTIVITY_FACTORS[input.activity]}`,
    sourceNote:
      "Energy: Mifflin-St Jeor equation with standard activity factors. Protein: ICMR-NIN 2020 RDA floor (0.83 g/kg) and published sports-nutrition ranges. A suggestion, not medical advice.",
    warnings,
  };
}

/** Warn when a manually set kcal target is below BMR (NUTRITION_RULES §2.1). */
export function manualKcalWarning(kcal: number, bmr: number): string | null {
  return kcal < bmr
    ? "That's below your estimated resting needs. Consider checking with a doctor or dietitian before going this low."
    : null;
}
