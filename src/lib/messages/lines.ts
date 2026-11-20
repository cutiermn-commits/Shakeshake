import { MESSAGE_LIBRARY } from "./library.generated";
import type { Category } from "./engine";

/**
 * Pick a line from the copy library for in-app moments (toasts, loading text, meters).
 * Deterministic when a seed is given (so server and client render the same line), random otherwise.
 * Callers must NOT use playful categories while safety mode is on (TONE_AND_COPY §2.5).
 */
export function pickLine(category: Category, seed?: string): string {
  const pool = MESSAGE_LIBRARY.filter((m) => m.category === category && m.active);
  if (!pool.length) return "";
  if (seed === undefined) return pool[Math.floor(Math.random() * pool.length)].text;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length].text;
}

export function linesFor(category: Category): string[] {
  return MESSAGE_LIBRARY.filter((m) => m.category === category && m.active).map((m) => m.text);
}
