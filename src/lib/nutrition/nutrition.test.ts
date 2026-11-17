import { describe, expect, it } from "vitest";
import { bmrMifflinStJeor, manualKcalWarning, suggestTargets } from "./targets";
import { computeRecipeNutrition, needsOil, scaleMacros, statusFor } from "./compute";
import { FoodMatcher, normalizeName } from "./match";
import { findConflicts, isSafe } from "./allergy";
import { buildGroceryList, shoppableUnit } from "./grocery";
import { dailyBalance, isSafetyMode, localDate, weekStart } from "./balance";
import { INGREDIENT_CATALOG } from "../data/ingredients";
import { SYNTHETIC_FOODS } from "../../../tests/fixtures/foods";

describe("targets (NUTRITION_RULES §2)", () => {
  it("matches the worked example: 40 y woman, 60 kg, 160 cm → BMR 1239, TDEE ≈ 1920", () => {
    expect(bmrMifflinStJeor({ sex: "female", weightKg: 60, heightCm: 160, age: 40 })).toBe(1239);
    const t = suggestTargets({ sex: "female", weightKg: 60, heightCm: 160, age: 40, activity: "moderate", goal: "maintain" });
    expect(t.bmr).toBe(1239);
    expect(t.tdee).toBe(1920); // 1239 × 1.55 = 1920.45
    expect(t.kcalMin).toBe(1820); // 0.95 × 1920.45 = 1824 → round 10
    expect(t.kcalMax).toBe(2020);
  });
  it("male formula adds +5", () => {
    expect(bmrMifflinStJeor({ sex: "male", weightKg: 70, heightCm: 175, age: 30 })).toBe(700 + 1093.75 - 150 + 5);
  });
  it("Indian-adjusted option applies −5 %", () => {
    const t = suggestTargets({ sex: "female", weightKg: 60, heightCm: 160, age: 40, activity: "moderate", goal: "maintain", indianAdjusted: true });
    expect(t.bmr).toBe(Math.round(1239 * 0.95));
    expect(t.method).toMatch(/Indian-adjusted/);
  });
  it("never suggests below BMR (floor)", () => {
    const t = suggestTargets({ sex: "female", weightKg: 60, heightCm: 160, age: 40, activity: "sedentary", goal: "lose" });
    // TDEE 1486.8 × 0.8 = 1189 < BMR 1239 → raised
    expect(t.kcalMin).toBeGreaterThanOrEqual(1239 - 5);
    expect(t.warnings.join(" ")).toMatch(/BMR/);
  });
  it("protein ranges by activity/goal", () => {
    const sed = suggestTargets({ sex: "female", weightKg: 60, heightCm: 160, age: 40, activity: "sedentary", goal: "maintain" });
    expect([sed.proteinGMin, sed.proteinGMax]).toEqual([50, 60]); // 0.83 / 1.0 g/kg
    const reg = suggestTargets({ sex: "female", weightKg: 60, heightCm: 160, age: 40, activity: "light", goal: "maintain" });
    expect([reg.proteinGMin, reg.proteinGMax]).toEqual([60, 72]);
    const tr = suggestTargets({ sex: "female", weightKg: 60, heightCm: 160, age: 40, activity: "moderate", goal: "lose" });
    expect([tr.proteinGMin, tr.proteinGMax]).toEqual([96, 132]);
  });
  it("medical flag suppresses protein suggestion", () => {
    const t = suggestTargets({ sex: "female", weightKg: 60, heightCm: 160, age: 40, activity: "very_active", goal: "gain", medicalFlag: true });
    expect(t.proteinGMin).toBeNull();
    expect(t.proteinBasis).toBe("doctor");
  });
  it("rejects implausible inputs", () => {
    expect(() => suggestTargets({ sex: "female", weightKg: 10, heightCm: 160, age: 40, activity: "moderate", goal: "maintain" })).toThrow();
  });
  it("warns when manual kcal < BMR", () => {
    expect(manualKcalWarning(1100, 1239)).toBeTruthy();
    expect(manualKcalWarning(1500, 1239)).toBeNull();
  });
});

describe("matching (NUTRITION_RULES §3.2)", () => {
  const m = new FoodMatcher(SYNTHETIC_FOODS);
  it("normalises names", () => {
    expect(normalizeName("Tomatoes (ripe), chopped")).toBe("tomato chopped");
  });
  it("matches exact, alias, descriptor-stripped and fuzzy", () => {
    expect(m.match("Onion")?.kind).toBe("exact");
    expect(m.match("tuvaram paruppu")?.food.key).toBe("toor_dal");
    expect(m.match("thayir")?.food.key).toBe("curd");
    expect(m.match("vanjaram")?.food.key).toBe("seer_fish");
    expect(m.match("finely chopped onions")?.food.key).toBe("onion");
    expect(m.match("toor daal")?.kind).toBe("fuzzy");
    expect(m.match("dragon fruit")).toBeNull();
  });
});

describe("recipe nutrition compute (NUTRITION_RULES §3)", () => {
  const m = new FoodMatcher(SYNTHETIC_FOODS);
  it("computes per-serving macros from foods table", () => {
    const r = computeRecipeNutrition(
      [
        { name: "chicken", grams: 400 },
        { name: "onion", grams: 100 },
        { name: "oil", grams: 20 },
      ],
      m,
      { title: "Pepper chicken", steps: ["Cook"], servings: 2 },
    );
    // kcal = 400 + 40 + 180 = 620 → /2 = 310 ; protein = 80 + 1 = 81 → 40.5
    expect(r.perServing).toEqual({ kcal: 310, proteinG: 40.5, fatG: 14, carbG: 5 });
    expect(r.status).toBe("computed");
    expect(r.oilAdded).toBe(false);
  });
  it("adds default oil when a fried dish omits fat, and flags it", () => {
    const r = computeRecipeNutrition([{ name: "seer fish", grams: 300 }], m, { title: "Vanjaram fry", steps: ["Shallow fry"], servings: 2 });
    expect(r.oilAdded).toBe(true);
    expect(r.ingredients.find((i) => i.added)?.grams).toBe(10);
  });
  it("status thresholds 95 % / 70 %", () => {
    expect(statusFor(0.95)).toBe("computed");
    expect(statusFor(0.94)).toBe("partial");
    expect(statusFor(0.7)).toBe("partial");
    expect(statusFor(0.69)).toBe("ai_estimate");
  });
  it("partial lists unmatched; ai_estimate falls back to AI figures", () => {
    const partial = computeRecipeNutrition(
      [
        { name: "chicken", grams: 800 },
        { name: "kokum", grams: 100 },
      ],
      m,
      { title: "Curry", steps: ["Simmer"], servings: 2 },
    );
    expect(partial.status).toBe("partial");
    expect(partial.unmatched).toEqual(["kokum"]);
    const est = computeRecipeNutrition([{ name: "mystery leaf", grams: 100 }], m, { title: "X", steps: ["boil"], servings: 1, aiEstimate: { kcal: 222, proteinG: 11 } });
    expect(est.status).toBe("ai_estimate");
    expect(est.perServing.kcal).toBe(222);
    expect(est.sourceLine).toMatch(/AI estimate/);
  });
  it("needsOil detects tempering words", () => {
    expect(needsOil("Sambar", ["Temper mustard seeds"])).toBe(true);
    expect(needsOil("Steamed idli", ["Steam 10 min"])).toBe(false);
  });
  it("portion scaling clamps 0.5–2.0", () => {
    expect(scaleMacros({ kcal: 100, proteinG: 10, fatG: 1, carbG: 1 }, 3).kcal).toBe(200);
    expect(scaleMacros({ kcal: 100, proteinG: 10, fatG: 1, carbG: 1 }, 0.1).kcal).toBe(50);
  });
});

describe("allergy hard filter (M2-05)", () => {
  const prawnThokku = { title: "Eral thokku", ingredients: [{ name: "prawns" }, { name: "onion" }] };
  it("blocks declared allergens via aliases", () => {
    expect(isSafe(prawnThokku, ["shellfish"])).toBe(false);
    expect(isSafe(prawnThokku, ["Prawns"])).toBe(false);
    expect(isSafe({ title: "Chutney", ingredients: [{ name: "groundnut" }] }, ["peanut"])).toBe(false);
    expect(isSafe({ title: "Curd rice", ingredients: [{ name: "thayir" }] }, ["lactose"])).toBe(false);
  });
  it("does not false-positive on substrings", () => {
    expect(isSafe({ title: "Tilapia fry", ingredients: [{ name: "tilapia" }] }, ["sesame"])).toBe(true);
    expect(isSafe({ title: "Nutmeg rice", ingredients: [{ name: "nutmeg" }] }, ["nut"])).toBe(true);
  });
  it("reports dislikes separately", () => {
    const hits = findConflicts({ title: "Brinjal curry", ingredients: [{ name: "brinjal" }] }, [], ["brinjal"]);
    expect(hits).toEqual([{ kind: "dislike", declared: "brinjal", matchedIn: "brinjal curry" }]);
  });
});

describe("grocery (M4-02)", () => {
  it("aggregates, scales by servings and groups by aisle", () => {
    const list = buildGroceryList([
      { servings: 2, servingsToCook: 2, ingredients: [{ name: "chicken", grams: 500 }, { name: "onion", grams: 200 }, { name: "salt", grams: 5 }] },
      { servings: 4, servingsToCook: 2, ingredients: [{ name: "chicken", grams: 1200 }, { name: "big onion", grams: 220 }] },
    ]);
    const chicken = list.find((i) => i.key === "chicken")!;
    expect(chicken.grams).toBe(1100);
    expect(chicken).toMatchObject({ qty: 1.25, unit: "kg", aisleLabel: "Meat & fish" });
    const onion = list.find((i) => i.key === "onion")!;
    expect(onion).toMatchObject({ grams: 310, unit: "pcs", qty: 3, isStaple: true });
    expect(list[0].aisle).toBe("meat_fish");
  });
  it("rounds to shoppable units", () => {
    expect(shoppableUnit(120)).toEqual({ qty: 150, unit: "g" });
    expect(shoppableUnit(12)).toEqual({ qty: 15, unit: "g" });
    expect(shoppableUnit(130, 50)).toEqual({ qty: 3, unit: "pcs" });
  });
  it("catalogue has ≥ 150 ingredients with unique keys", () => {
    expect(INGREDIENT_CATALOG.length).toBeGreaterThanOrEqual(150);
    expect(new Set(INGREDIENT_CATALOG.map((c) => c.key)).size).toBe(INGREDIENT_CATALOG.length);
  });
});

describe("balance & safety (NUTRITION_RULES §6–7)", () => {
  it("uses BMR as estimated resting burn", () => {
    const b = dailyBalance({ date: "2026-11-17", intakeKcal: 1800, proteinG: 90, activeKcal: 400, totalKcalBurn: null, mealsLogged: 3 }, 1239);
    expect(b).toMatchObject({ burnKcal: 1639, net: 161, restingIsEstimate: true });
  });
  it("safety mode after 3 consecutive logged days < 1000 kcal", () => {
    const d = (date: string, kcal: number, meals = 2) => ({ date, intakeKcal: kcal, proteinG: 0, activeKcal: null, totalKcalBurn: null, mealsLogged: meals });
    expect(isSafetyMode([d("2026-11-16", 800), d("2026-11-15", 900), d("2026-11-14", 700)], "2026-11-17")).toBe(true);
    expect(isSafetyMode([d("2026-11-16", 800), d("2026-11-15", 900, 0), d("2026-11-14", 700)], "2026-11-17")).toBe(false);
    expect(isSafetyMode([d("2026-11-16", 800), d("2026-11-15", 1200), d("2026-11-14", 700)], "2026-11-17")).toBe(false);
  });
  it("dates in IST and Monday week start", () => {
    expect(localDate(new Date("2026-11-17T20:00:00Z"), "Asia/Kolkata")).toBe("2026-11-18");
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday → Monday
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
  });
});
