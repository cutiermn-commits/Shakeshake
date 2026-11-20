/**
 * Message engine — TONE_AND_COPY §3/§4, DECISIONS D-018.
 * Decides WHICH message to send and WHETHER it goes out as a push or only to the in-app inbox.
 */

export type Category =
  | "morning" | "suggestion_ready" | "swap" | "plate_reminder" | "logged_thanks" | "protein_hit" | "protein_close"
  | "streak" | "missed_day" | "burn_logged" | "leaderboard_up" | "leaderboard_week_won" | "weekly_plan"
  | "grocery_ready" | "love_note" | "empty_state" | "error_friendly" | "caring" | "loading" | "chosen";

export interface Message {
  id: string;
  category: Category;
  text: string;
  active: boolean;
}

export interface Send {
  messageId: string;
  category: Category;
  sentAt: Date;
  channel: "push" | "inbox";
}

export interface EngineConfig {
  pushDailyCap: number; // D-018: 4
  quietStartMin: number; // 22:00
  quietEndMin: number; // 07:00
  noRepeatDays: number; // 21
  loveNotesPerWeek: number; // 2
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  pushDailyCap: 4,
  quietStartMin: 22 * 60,
  quietEndMin: 7 * 60,
  noRepeatDays: 21,
  loveNotesPerWeek: 2,
};

/** Categories that may push (everything else is in-app only). TONE_AND_COPY §3. */
export const PUSH_CATEGORIES = new Set<Category>([
  "morning", "suggestion_ready", "plate_reminder", "protein_hit", "streak", "leaderboard_week_won", "weekly_plan", "love_note", "missed_day", "caring",
]);

/** Playful categories suppressed in safety mode (NUTRITION_RULES §7). */
export const PLAYFUL = new Set<Category>(["morning", "suggestion_ready", "swap", "logged_thanks", "protein_hit", "protein_close", "streak", "burn_logged", "leaderboard_up", "leaderboard_week_won", "love_note", "grocery_ready", "weekly_plan", "missed_day", "loading", "chosen"]);

export function inQuietHours(localMin: number, cfg: EngineConfig = DEFAULT_ENGINE_CONFIG): boolean {
  const { quietStartMin: s, quietEndMin: e } = cfg;
  return s > e ? localMin >= s || localMin < e : localMin >= s && localMin < e;
}

export interface PickInput {
  category: Category;
  now: Date;
  localMinutes: number;
  /** Sends for this user in the current local day. */
  sendsToday: Send[];
  /** Sends for this user in the last `noRepeatDays` (and ≥ 7 days for love-note cap). */
  recentSends: Send[];
  library: Message[];
  safetyMode: boolean;
  pushEnabled: boolean;
  /** Per-category opt-outs (push only). */
  mutedCategories?: Category[];
  random?: () => number;
  cfg?: EngineConfig;
}

export interface PickResult {
  message: Message;
  channel: "push" | "inbox";
  reason: string;
}

export function pickMessage(input: PickInput): PickResult | null {
  const cfg = input.cfg ?? DEFAULT_ENGINE_CONFIG;
  const rnd = input.random ?? Math.random;
  let category = input.category;

  if (input.safetyMode && PLAYFUL.has(category)) {
    // Safety mode: replace every playful message with the caring check-in (at most once a day).
    category = "caring";
    const caringToday = input.sendsToday.some((s) => s.category === "caring");
    if (caringToday) return null; // at most one caring message a day
  }

  if (category === "love_note") {
    const weekAgo = input.now.getTime() - 7 * 86400_000;
    const n = input.recentSends.filter((s) => s.category === "love_note" && s.sentAt.getTime() >= weekAgo).length;
    if (n >= cfg.loveNotesPerWeek) return null;
  }

  const cutoff = input.now.getTime() - cfg.noRepeatDays * 86400_000;
  const recentIds = new Set(input.recentSends.filter((s) => s.sentAt.getTime() >= cutoff).map((s) => s.messageId));
  const pool = input.library.filter((m) => m.active && m.category === category);
  if (!pool.length) return null;
  let candidates = pool.filter((m) => !recentIds.has(m.id));
  if (!candidates.length) {
    // Library exhausted inside the window: caring copy may repeat (safety beats variety); others skip.
    if (category !== "caring") return null;
    candidates = pool;
  }
  const message = candidates[Math.floor(rnd() * candidates.length) % candidates.length];

  const pushesToday = input.sendsToday.filter((s) => s.channel === "push").length;
  let channel: "push" | "inbox" = "push";
  let reason = "push";
  if (!input.pushEnabled) [channel, reason] = ["inbox", "push not enabled"];
  else if (!PUSH_CATEGORIES.has(category)) [channel, reason] = ["inbox", "in-app category"];
  else if (input.mutedCategories?.includes(category)) [channel, reason] = ["inbox", "category muted"];
  else if (inQuietHours(input.localMinutes, cfg)) [channel, reason] = ["inbox", "quiet hours"];
  else if (pushesToday >= cfg.pushDailyCap) [channel, reason] = ["inbox", "daily push cap"];

  return { message, channel, reason };
}

/** Push copy rule check (TONE_AND_COPY §2.6): ≤ 140 chars, ≤ 2 emojis. */
export function pushCopyOk(text: string): boolean {
  const emojis = text.match(/\p{Extended_Pictographic}/gu) ?? [];
  return [...text].length <= 140 && emojis.length <= 2;
}
