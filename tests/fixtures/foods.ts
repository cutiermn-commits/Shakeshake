/**
 * SYNTHETIC TEST VALUES — NOT REAL NUTRITION DATA.
 * Round numbers chosen only to make arithmetic easy to verify in tests. Real values come
 * from USDA FoodData Central via scripts/import-fdc.ts. Never import this file from app code.
 */
import type { FoodRecord } from "@/lib/nutrition/match";
import { INGREDIENT_CATALOG } from "@/lib/data/ingredients";

const synthetic: Record<string, [kcal: number, protein: number, fat: number, carb: number]> = {
  chicken: [100, 20, 2, 0],
  rice_raw: [300, 10, 0, 70],
  onion: [40, 1, 0, 10],
  tomato: [20, 1, 0, 4],
  oil: [900, 0, 100, 0],
  toor_dal: [300, 20, 2, 60],
  egg: [150, 12, 10, 1],
  seer_fish: [100, 20, 2, 0],
  coconut: [350, 3, 33, 15],
  curd: [60, 3, 3, 5],
};

export const SYNTHETIC_FOODS: FoodRecord[] = INGREDIENT_CATALOG.filter((c) => c.key in synthetic).map((c) => {
  const [kcal, p, f, cb] = synthetic[c.key];
  return { id: `food-${c.key}`, key: c.key, name: c.name, aliases: c.aliases, kcalPer100g: kcal, proteinG: p, fatG: f, carbG: cb };
});
