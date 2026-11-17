/**
 * Allergy & dislike hard filter (ARCHITECTURE §6.1 step 5, BACKLOG M2-05).
 * Runs AFTER schema validation and regardless of what the AI claims.
 * Matching is word-boundary, case-insensitive, over title + ingredient names.
 */
import { normalizeName } from "./match";

/** Allergen groups → terms (English + common South Indian / Hindi names). Extend, never shrink. */
export const ALLERGEN_GROUPS: Record<string, string[]> = {
  peanut: ["peanut", "groundnut", "verkadalai", "nilakadala", "kappalandi", "palli", "shenga", "kadalekai", "moongphali", "groundnut oil", "peanut oil"],
  tree_nut: ["cashew", "mundhiri", "andiparippu", "jeedipappu", "godambi", "kaju", "almond", "badam", "pistachio", "walnut", "akhrot", "hazelnut", "pecan", "macadamia"],
  shellfish: ["prawn", "shrimp", "eral", "chemmeen", "royyalu", "jhinga", "crab", "nandu", "njandu", "lobster", "mussel", "kallummakkaya", "clam", "kakka", "oyster", "squid", "kanava", "calamari"],
  fish: ["fish", "meen", "seer", "vanjaram", "neymeen", "surmai", "mackerel", "ayala", "bangda", "sardine", "mathi", "anchovy", "nethili", "natholi", "pomfret", "vavval", "tuna", "salmon", "tilapia", "rohu", "carp", "fish sauce"],
  egg: ["egg", "muttai", "mutta", "anda", "guddu", "motte", "mayonnaise"],
  dairy: ["milk", "paal", "curd", "thayir", "thairu", "perugu", "mosaru", "dahi", "yogurt", "yoghurt", "paneer", "ghee", "nei", "butter", "vennai", "buttermilk", "mor", "majjiga", "cream", "malai", "cheese", "khoa", "whey"],
  gluten: ["wheat", "atta", "maida", "rava", "sooji", "semolina", "godhumai", "bread", "barley", "rye", "vermicelli", "semiya", "sevai", "dalia", "broken wheat", "soy sauce"],
  sesame: ["sesame", "ellu", "nuvvulu", "til", "gingelly", "nallennai"],
  soy: ["soy", "soya", "tofu", "edamame", "meal maker", "nutrela", "soy sauce"],
  mustard: ["mustard", "kadugu", "kaduku", "aavalu", "sasive", "rai"],
};

/** Map a user-entered allergy ("Peanuts", "prawns", "lactose") to search terms. */
export function termsForAllergy(raw: string): string[] {
  const n = normalizeName(raw);
  const aliases: Record<string, string> = {
    peanut: "peanut", groundnut: "peanut", nut: "tree_nut", "tree nut": "tree_nut", cashew: "tree_nut", almond: "tree_nut",
    shellfish: "shellfish", prawn: "shellfish", shrimp: "shellfish", crab: "shellfish", seafood: "shellfish",
    fish: "fish", egg: "egg", dairy: "dairy", milk: "dairy", lactose: "dairy",
    gluten: "gluten", wheat: "gluten", sesame: "sesame", soy: "soy", soya: "soy", mustard: "mustard",
  };
  const group = aliases[n];
  const terms = group ? [...ALLERGEN_GROUPS[group]] : [];
  if (n === "seafood") terms.push(...ALLERGEN_GROUPS.fish);
  if (n) terms.push(n);
  return [...new Set(terms)];
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string): boolean {
  const t = normalizeName(term);
  if (!t) return false;
  // word boundary + optional plural
  return new RegExp(`\\b${escape(t)}(e?s)?\\b`, "i").test(text);
}

export interface FilterableRecipe {
  title: string;
  ingredients: { name: string }[];
}

export interface FilterHit {
  kind: "allergy" | "dislike";
  declared: string;
  matchedIn: string;
}

export function findConflicts(recipe: FilterableRecipe, allergies: string[], dislikes: string[] = []): FilterHit[] {
  const fields = [recipe.title, ...recipe.ingredients.map((i) => i.name)].map(normalizeName);
  const hits: FilterHit[] = [];
  for (const a of allergies) {
    for (const term of termsForAllergy(a)) {
      const f = fields.find((x) => containsTerm(x, term));
      if (f) {
        hits.push({ kind: "allergy", declared: a, matchedIn: f });
        break;
      }
    }
  }
  for (const d of dislikes) {
    const f = fields.find((x) => containsTerm(x, d));
    if (f) hits.push({ kind: "dislike", declared: d, matchedIn: f });
  }
  return hits;
}

export function isSafe(recipe: FilterableRecipe, allergies: string[], dislikes: string[] = []): boolean {
  return findConflicts(recipe, allergies, dislikes).length === 0;
}
