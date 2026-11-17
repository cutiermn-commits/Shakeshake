/**
 * Grocery list aggregation (BACKLOG M4-02): sum grams across planned recipes,
 * convert to shoppable units, group by aisle, flag pantry staples.
 */
import { AISLE_LABELS, INGREDIENT_CATALOG, type Aisle, type CatalogItem } from "../data/ingredients";
import { FoodMatcher } from "./match";

export interface PlannedRecipe {
  servings: number; // servings the recipe was written for
  servingsToCook: number; // servings planned for this slot
  ingredients: { name: string; grams: number }[];
}

export interface GroceryItem {
  key: string;
  name: string;
  aisle: Aisle;
  aisleLabel: string;
  grams: number;
  qty: number;
  unit: "g" | "kg" | "pcs";
  isStaple: boolean;
}

const catalogMatcher = new FoodMatcher<CatalogItem>(INGREDIENT_CATALOG);

export function shoppableUnit(grams: number, gramsPerPiece?: number): { qty: number; unit: GroceryItem["unit"] } {
  if (gramsPerPiece && gramsPerPiece >= 20) return { qty: Math.max(1, Math.ceil(grams / gramsPerPiece)), unit: "pcs" };
  if (grams >= 1000) return { qty: Math.ceil(grams / 250) / 4, unit: "kg" }; // round up to 0.25 kg
  if (grams < 50) return { qty: Math.max(5, Math.ceil(grams / 5) * 5), unit: "g" };
  return { qty: Math.ceil(grams / 50) * 50, unit: "g" }; // round up to 50 g
}

export function buildGroceryList(recipes: PlannedRecipe[]): GroceryItem[] {
  const acc = new Map<string, { item: CatalogItem | null; name: string; grams: number }>();
  for (const r of recipes) {
    const factor = r.servings > 0 ? r.servingsToCook / r.servings : 1;
    for (const ing of r.ingredients) {
      const m = catalogMatcher.match(ing.name);
      const key = m ? m.food.key : `other:${ing.name.toLowerCase().trim()}`;
      const prev = acc.get(key) ?? { item: m?.food ?? null, name: m?.food.name ?? ing.name, grams: 0 };
      prev.grams += Math.max(0, ing.grams) * factor;
      acc.set(key, prev);
    }
  }
  const items: GroceryItem[] = [];
  for (const [key, { item, name, grams }] of acc) {
    const aisle: Aisle = item?.aisle ?? "other";
    const { qty, unit } = shoppableUnit(grams, item?.gramsPerPiece);
    items.push({ key, name, aisle, aisleLabel: AISLE_LABELS[aisle], grams: Math.round(grams), qty, unit, isStaple: !!item?.staple });
  }
  const order = Object.keys(AISLE_LABELS);
  return items.sort((a, b) => order.indexOf(a.aisle) - order.indexOf(b.aisle) || a.name.localeCompare(b.name));
}

export function groceryListAsText(items: GroceryItem[], includeStaples: boolean): string {
  const lines: string[] = ["Shake Shake grocery list 🛒"];
  let aisle = "";
  for (const i of items) {
    if (i.isStaple && !includeStaples) continue;
    if (i.aisleLabel !== aisle) {
      aisle = i.aisleLabel;
      lines.push("", `${aisle}:`);
    }
    lines.push(`• ${i.name} — ${i.qty} ${i.unit}`);
  }
  return lines.join("\n");
}
