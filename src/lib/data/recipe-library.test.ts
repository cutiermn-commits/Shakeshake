import { describe, expect, it } from "vitest";
import { RECIPE_LIBRARY } from "./recipe-library";
import { findConflicts, isSafe } from "../nutrition/allergy";
import { INGREDIENT_CATALOG } from "./ingredients";
import { FoodMatcher } from "../nutrition/match";

describe("built-in recipe library (D-031)", () => {
  it("has enough lunches and dinners for a week of fallbacks", () => {
    expect(RECIPE_LIBRARY.filter((r) => r.meal_type === "lunch").length).toBeGreaterThanOrEqual(14);
    expect(RECIPE_LIBRARY.filter((r) => r.meal_type === "dinner").length).toBeGreaterThanOrEqual(14);
    expect(new Set(RECIPE_LIBRARY.map((r) => r.title)).size).toBe(RECIPE_LIBRARY.length);
  });
  it("v2 covers sprouts, paneer, soya chunks and millets with enough recipes each", () => {
    expect(RECIPE_LIBRARY.length).toBeGreaterThanOrEqual(80);
    const has = (n: string) => RECIPE_LIBRARY.filter((r) => r.ingredients.some((i) => i.name === n)).length;
    expect(has("mung sprouts")).toBeGreaterThanOrEqual(5);
    expect(has("paneer")).toBeGreaterThanOrEqual(8);
    expect(has("soya chunks")).toBeGreaterThanOrEqual(3);
    expect(RECIPE_LIBRARY.filter((r) => r.ingredients.some((i) => /millet|ragi|jowar|quinoa/.test(i.name))).length).toBeGreaterThanOrEqual(8);
  });
  it("offers every diet type", () => {
    for (const d of ["nonveg", "egg", "veg"] as const) expect(RECIPE_LIBRARY.some((r) => r.diet_type === d)).toBe(true);
  });
  it("veg and egg recipes never contain meat or fish (and veg has no egg)", () => {
    const meat = ["chicken", "mutton", "fish", "prawn", "crab", "meat", "keema", "squid", "anchovy", "mackerel", "tuna", "seer"];
    for (const r of RECIPE_LIBRARY.filter((x) => x.diet_type !== "nonveg")) {
      expect(findConflicts(r, [], r.diet_type === "veg" ? [...meat, "egg"] : meat), r.title).toEqual([]);
    }
  });
  it("almost every ingredient name is in the catalogue (so nutrition can be computed)", () => {
    const m = new FoodMatcher(INGREDIENT_CATALOG);
    const allowedUnmatched = new Set(["curry leaves"]); // not in USDA FDC; tiny amounts
    for (const r of RECIPE_LIBRARY) for (const i of r.ingredients) if (!allowedUnmatched.has(i.name)) expect(m.match(i.name), `${r.title}: ${i.name}`).not.toBeNull();
  });
  it("the allergy filter hides library recipes containing a declared allergen", () => {
    const prawn = RECIPE_LIBRARY.find((r) => r.title.startsWith("Prawn thokku"))!;
    expect(isSafe(prawn, ["shellfish"])).toBe(false);
    const peanutUsers = RECIPE_LIBRARY.filter((r) => !isSafe(r, ["peanut"]));
    expect(peanutUsers.map((r) => r.title)).toContain("Mackerel fry with lemon rice");
  });
});
