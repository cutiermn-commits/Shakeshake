import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DAILY_CAP, dailyPoints, median, rank, shouldFlagManualBurn, streakLength } from "./leaderboard/score";
import { inQuietHours, pickMessage, pushCopyOk, type Message, type Send } from "./messages/engine";
import { MESSAGE_LIBRARY } from "./messages/library.generated";
import { AiProviderError, runAi, type GatewayDeps } from "./ai/gateway";
import { PlateEstimateSchema, RecipeSchema } from "./ai/schemas";
import { processRecipes } from "./ai/postprocess";
import { FoodMatcher } from "./nutrition/match";
import { addDays } from "./nutrition/balance";
import { SYNTHETIC_FOODS } from "../../tests/fixtures/foods";
import validRecipe from "../../tests/fixtures/ai/recipe.valid.json";
import allergenRecipe from "../../tests/fixtures/ai/recipe.allergen.json";
import oilMissing from "../../tests/fixtures/ai/recipe.oil-missing.json";
import invalidRecipe from "../../tests/fixtures/ai/recipe.invalid.json";

describe("leaderboard scoring (D-015)", () => {
  const goals = { activeKcalGoal: 400, proteinTargetG: 80 };
  it("caps move at 200, protein at 100, logging at 50; daily max 350", () => {
    expect(dailyPoints({ activeKcal: 2000, proteinG: 500, photoLogs: 5, streakActive: true }, goals)).toEqual({ movePts: 200, proteinPts: 100, loggingPts: 50, total: 350 });
    expect(DAILY_CAP).toBe(350);
  });
  it("is % of own goal", () => {
    expect(dailyPoints({ activeKcal: 200, proteinG: 40, photoLogs: 1, streakActive: false }, goals)).toEqual({ movePts: 50, proteinPts: 50, loggingPts: 20, total: 120 });
  });
  it("zero / missing goals score zero, not NaN", () => {
    expect(dailyPoints({ activeKcal: 300, proteinG: 50, photoLogs: 0, streakActive: false }, { activeKcalGoal: 0, proteinTargetG: 0 }).total).toBe(0);
  });
  it("flags manual burn > 2× 30-day median only with enough history", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(shouldFlagManualBurn(900, [300, 320, 310, 290, 305, 315, 300])).toBe(true);
    expect(shouldFlagManualBurn(500, [300, 320, 310, 290, 305, 315, 300])).toBe(false);
    expect(shouldFlagManualBurn(9000, [300, 320])).toBe(false);
  });
  it("streaks and ranking with ties", () => {
    const s = new Set(["2026-11-17", "2026-11-16", "2026-11-15", "2026-11-13"]);
    expect(streakLength(s, "2026-11-17", addDays)).toBe(3);
    expect(streakLength(s, "2026-11-18", addDays)).toBe(3);
    expect(rank([{ total: 10 }, { total: 30 }, { total: 30 }]).map((r) => r.position)).toEqual([1, 1, 3]);
  });
});

describe("message engine (TONE_AND_COPY §3, D-018)", () => {
  const now = new Date("2026-11-17T06:00:00Z");
  const lib: Message[] = [
    { id: "a", category: "morning", text: "A", active: true },
    { id: "b", category: "morning", text: "B", active: true },
    { id: "c", category: "caring", text: "C", active: true },
    { id: "l1", category: "love_note", text: "L", active: true },
    { id: "t", category: "logged_thanks", text: "T", active: true },
  ];
  const base = { now, localMinutes: 9 * 60, sendsToday: [] as Send[], recentSends: [] as Send[], library: lib, safetyMode: false, pushEnabled: true, random: () => 0 };
  it("quiet hours wrap midnight", () => {
    expect(inQuietHours(23 * 60)).toBe(true);
    expect(inQuietHours(6 * 60 + 59)).toBe(true);
    expect(inQuietHours(7 * 60)).toBe(false);
  });
  it("no repeat within 21 days", () => {
    const r = pickMessage({ ...base, category: "morning", recentSends: [{ messageId: "a", category: "morning", sentAt: new Date(now.getTime() - 3 * 86400_000), channel: "push" }] });
    expect(r?.message.id).toBe("b");
  });
  it("skips when the category is exhausted", () => {
    const recent = ["a", "b"].map((id) => ({ messageId: id, category: "morning" as const, sentAt: now, channel: "push" as const }));
    expect(pickMessage({ ...base, category: "morning", recentSends: recent })).toBeNull();
  });
  it("routes to inbox in quiet hours, at cap, for in-app categories, or without push", () => {
    expect(pickMessage({ ...base, category: "morning", localMinutes: 23 * 60 })?.channel).toBe("inbox");
    const four = Array.from({ length: 4 }, (_, i) => ({ messageId: `x${i}`, category: "morning" as const, sentAt: now, channel: "push" as const }));
    expect(pickMessage({ ...base, category: "morning", sendsToday: four })?.reason).toBe("daily push cap");
    expect(pickMessage({ ...base, category: "logged_thanks" })?.channel).toBe("inbox");
    expect(pickMessage({ ...base, category: "morning", pushEnabled: false })?.channel).toBe("inbox");
  });
  it("safety mode replaces playful copy with caring, once a day", () => {
    expect(pickMessage({ ...base, category: "morning", safetyMode: true })?.message.id).toBe("c");
    expect(pickMessage({ ...base, category: "morning", safetyMode: true, sendsToday: [{ messageId: "c", category: "caring", sentAt: now, channel: "push" }] })).toBeNull();
  });
  it("love notes ≤ 2/week", () => {
    const two = [1, 2].map((d) => ({ messageId: `z${d}`, category: "love_note" as const, sentAt: new Date(now.getTime() - d * 86400_000), channel: "push" as const }));
    expect(pickMessage({ ...base, category: "love_note", recentSends: two })).toBeNull();
  });
  it("every push-eligible seed message obeys ≤140 chars / ≤2 emojis", () => {
    expect(MESSAGE_LIBRARY.length).toBeGreaterThan(40);
    for (const m of MESSAGE_LIBRARY) expect(pushCopyOk(m.text), m.text).toBe(true);
  });
  it("copy library has no duplicate lines and never comments on bodies or weight", () => {
    const texts = MESSAGE_LIBRARY.map((m) => m.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
    const body = /\b(weight|fat|slim|skinny|thin|belly|waist|kilos?|figure|curves)\b/i;
    for (const m of MESSAGE_LIBRARY) expect(body.test(m.text), m.text).toBe(false);
  });
  it("in-app categories exist for loading text and choosing a meal", () => {
    expect(MESSAGE_LIBRARY.filter((m) => m.category === "loading").length).toBeGreaterThanOrEqual(8);
    expect(MESSAGE_LIBRARY.filter((m) => m.category === "chosen").length).toBeGreaterThanOrEqual(5);
  });
  it("seed copy avoids banned food-moralising phrases", () => {
    const banned = /\b(cheat|guilty|burn it off|earn (your|it))\b/i;
    for (const m of MESSAGE_LIBRARY) expect(banned.test(m.text), m.text).toBe(false);
  });
});

describe("AI gateway (M2-02)", () => {
  const S = z.object({ a: z.number() });
  const mk = (over: Partial<GatewayDeps>, responses: (string | Error)[]): GatewayDeps & { calls: number } => {
    const deps: GatewayDeps & { calls: number } = {
      calls: 0,
      provider: {
        generateJson: async (): Promise<string> => {
          const r: string | Error = responses[deps.calls++];
          if (r instanceof Error) throw r;
          return r;
        },
      },
      hasConsent: async () => true,
      consumeQuota: async () => "ok" as const,
      ...over,
    };
    return deps;
  };
  const args = { userId: "u", kind: "suggest" as const, prompt: "p", schema: S };
  it("requires consent before any call", async () => {
    const d = mk({ hasConsent: async () => false }, ['{"a":1}']);
    expect(await runAi(d, args)).toEqual({ ok: false, reason: "no_consent" });
    expect(d.calls).toBe(0);
  });
  it("stops at quota", async () => {
    expect(await runAi(mk({ consumeQuota: async () => "user_limit" }, []), args)).toEqual({ ok: false, reason: "quota_user" });
    expect(await runAi(mk({ consumeQuota: async () => "global_limit" }, []), args)).toEqual({ ok: false, reason: "quota_global" });
  });
  it("maps an AI timeout to a friendly 'timeout' failure", async () => {
    expect(await runAi(mk({}, [new AiProviderError("timed out", 504)]), args)).toEqual({ ok: false, reason: "timeout" });
  });
  it("maps a busy model (503) to a friendly 'busy' failure", async () => {
    expect(await runAi(mk({}, [new AiProviderError("high demand", 503)]), args)).toEqual({ ok: false, reason: "busy" });
  });
  it("handles 429 gracefully", async () => {
    expect(await runAi(mk({}, [new AiProviderError("slow down", 429)]), args)).toEqual({ ok: false, reason: "rate_limited" });
  });
  it("repairs invalid JSON once, then gives up", async () => {
    const d = mk({}, ["not json", '```json\n{"a":2}\n```']);
    expect(await runAi(d, args)).toEqual({ ok: true, data: { a: 2 }, attempts: 2 });
    const bad = await runAi(mk({}, ['{"a":"x"}', '{"b":1}']), args);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.reason).toBe("invalid_output");
  });
  it("not configured without provider", async () => {
    expect(await runAi({ ...mk({}, []), provider: null }, args)).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("AI fixtures → schema → post-process (ai-recipe-pipeline)", () => {
  const matcher = new FoodMatcher(SYNTHETIC_FOODS);
  const profile = { allergies: ["shellfish"], dislikes: [], dietType: "nonveg" as const };
  it("valid fixture parses and gets app-computed nutrition", () => {
    const r = RecipeSchema.parse(validRecipe);
    const out = processRecipes([r], matcher, profile);
    expect(out.accepted).toHaveLength(1);
    expect(out.accepted[0].nutrition.sourceLine).toMatch(/USDA/);
  });
  it("invalid fixture is rejected by schema", () => {
    expect(RecipeSchema.safeParse(invalidRecipe).success).toBe(false);
  });
  it("allergen fixture is never shown", () => {
    const out = processRecipes([RecipeSchema.parse(allergenRecipe)], matcher, profile);
    expect(out.accepted).toHaveLength(0);
    expect(out.rejected[0].hits[0].kind).toBe("allergy");
  });
  it("oil-missing fixture gets default oil flagged", () => {
    const out = processRecipes([RecipeSchema.parse(oilMissing)], matcher, { ...profile, allergies: [] });
    expect(out.accepted[0].nutrition.oilAdded).toBe(true);
  });
  it("veg users never see meat", () => {
    const out = processRecipes([RecipeSchema.parse(validRecipe)], matcher, { allergies: [], dislikes: [], dietType: "veg" });
    expect(out.accepted).toHaveLength(0);
  });
  it("plate estimate schema enforces ordered ranges", () => {
    const ok = { dish_guess: "Meen kuzhambu with rice", components: [{ name: "rice", est_grams: 200 }], kcal_range: [450, 600], protein_g_range: [20, 30], confidence: "medium" };
    expect(PlateEstimateSchema.safeParse(ok).success).toBe(true);
    expect(PlateEstimateSchema.safeParse({ ...ok, kcal_range: [600, 450] }).success).toBe(false);
  });
});
