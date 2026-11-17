/**
 * Ingredient name → food matching (NUTRITION_RULES §3 step 2): exact → alias → fuzzy.
 */

export interface FoodRecord {
  id: string;
  key: string; // catalogue key
  name: string;
  aliases: string[];
  kcalPer100g: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fibreG?: number | null;
}

export type MatchKind = "exact" | "alias" | "fuzzy";

export interface MatchResult<F> {
  food: F;
  kind: MatchKind;
  score: number;
}

const DESCRIPTORS =
  /\b(fresh|raw|chopped|sliced|diced|grated|minced|finely|roughly|boneless|skinless|small|medium|large|big|whole|split|washed|soaked|peeled|cubed|pieces?|cut|optional|to taste|for garnish|cleaned|deveined|organic|homemade|plain)\b/g;

export function normalizeName(raw: string): string {
  let s = raw.toLowerCase();
  s = s.replace(/\(.*?\)/g, " "); // drop parentheticals
  s = s.replace(/[^a-z\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
  return s;
}

/** Strip descriptor words for a second-chance match ("finely chopped onion" → "onion"). */
export function coreName(raw: string): string {
  return normalizeName(raw).replace(DESCRIPTORS, " ").replace(/\s+/g, " ").trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/\s/g, "");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice coefficient on character bigrams, 0..1. */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  for (const [g, v] of A) inter += Math.min(v, B.get(g) ?? 0);
  return total === 0 ? 0 : (2 * inter) / total;
}

export const FUZZY_THRESHOLD = 0.82;

export class FoodMatcher<F extends { name: string; aliases: string[] }> {
  private byName = new Map<string, F>();
  private byAlias = new Map<string, F>();
  private all: { food: F; keys: string[] }[] = [];

  constructor(foods: F[]) {
    for (const f of foods) {
      const n = normalizeName(f.name);
      const c = coreName(f.name);
      if (!this.byName.has(n)) this.byName.set(n, f);
      if (c && !this.byName.has(c)) this.byName.set(c, f);
      const keys = [n, c];
      for (const a of f.aliases) {
        const na = normalizeName(a);
        if (!this.byAlias.has(na)) this.byAlias.set(na, f);
        keys.push(na);
      }
      this.all.push({ food: f, keys: keys.filter(Boolean) });
    }
  }

  match(raw: string): MatchResult<F> | null {
    const candidates = [normalizeName(raw), coreName(raw)].filter(Boolean);
    for (const c of candidates) {
      const exact = this.byName.get(c);
      if (exact) return { food: exact, kind: "exact", score: 1 };
    }
    for (const c of candidates) {
      const alias = this.byAlias.get(c);
      if (alias) return { food: alias, kind: "alias", score: 1 };
    }
    let best: MatchResult<F> | null = null;
    for (const c of candidates) {
      for (const { food, keys } of this.all) {
        for (const k of keys) {
          const s = dice(c, k);
          if (s >= FUZZY_THRESHOLD && (!best || s > best.score)) best = { food, kind: "fuzzy", score: s };
        }
      }
    }
    return best;
  }
}
