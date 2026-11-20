import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isSafetyMode } from "@/lib/nutrition/balance";
import { pickLine } from "@/lib/messages/lines";
import type { Category } from "@/lib/messages/engine";
import { dayTotals } from "./stats";

/** True when the caring safety mode applies (NUTRITION_RULES §7) — then no jokes or flirting. */
export async function inSafetyMode(supabase: SupabaseClient, uid: string, today: string): Promise<boolean> {
  try {
    return isSafetyMode(await dayTotals(supabase, uid, addDays(today, -4), today), today);
  } catch {
    return false;
  }
}

/** A playful line from the copy library, or a plain message while safety mode is on (TONE_AND_COPY §2.5). */
export async function playfulNote(supabase: SupabaseClient, uid: string, today: string, category: Category, plain: string): Promise<string> {
  return (await inSafetyMode(supabase, uid, today)) ? plain : pickLine(category) || plain;
}
