import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { geminiProviderFromEnv, AI_TIMEOUT_MS } from "@/lib/ai/gemini";
import { jsonSchemaFor } from "@/lib/ai/schemas";

/**
 * Diagnostics: open /api/health in the browser while signed in (any member; admins skip the quota).
 * Shows WHICH settings are present (never their values), database reachability, your AI consent,
 * today's AI usage and a tiny timed Gemini call. Does not count against the per-user AI quota.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const role = (claims?.claims?.app_metadata as { role?: string } | undefined)?.role;
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Sign in first, then open this page again." }, { status: 401 });
  const uid = claims.claims.sub as string;
  const isAdmin = role === "admin";

  const env = Object.fromEntries(
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "AI_GLOBAL_DAILY_CAP", "CRON_SECRET", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].map((k) => [
      k,
      process.env[k]?.trim() ? "set" : "MISSING",
    ]),
  );

  const [{ count: foods, error: foodsErr }, { data: consent }, { data: usage }, { data: profile }] = await Promise.all([
    supabase.from("foods").select("id", { count: "exact", head: true }),
    supabase.from("consents").select("granted").eq("user_id", uid).eq("purpose", "ai_processing").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_usage").select("kind, calls, date").eq("user_id", uid).order("date", { ascending: false }).limit(8),
    supabase.from("profiles").select("onboarded, diet_type").eq("id", uid).maybeSingle(),
  ]);

  let gemini: Record<string, unknown> = { configured: false };
  const provider = geminiProviderFromEnv();
  // Non-admins pay for the test call from their own daily AI allowance (abuse protection).
  let quota = "ok";
  if (provider && !isAdmin) {
    const { data, error } = await supabase.rpc("consume_ai_quota", { p_kind: "suggest", p_user_limit: Number(process.env.AI_DAILY_CALLS_PER_USER ?? 15), p_global_limit: Number(process.env.AI_GLOBAL_DAILY_CAP ?? 200) });
    quota = error ? `error: ${error.message}` : String(data);
  }
  if (provider && quota !== "ok") {
    gemini = { configured: true, model: process.env.GEMINI_MODEL, ok: false, skipped: `test call not made (quota: ${quota})` };
  } else if (provider) {
    const started = Date.now();
    try {
      const text = await provider.generateJson({
        prompt: 'Return JSON {"dish": "<one South Indian protein-rich dish name>"}.',
        jsonSchema: jsonSchemaFor(z.object({ dish: z.string() })),
      });
      gemini = { configured: true, model: process.env.GEMINI_MODEL, ok: true, ms: Date.now() - started, sample: text.slice(0, 120), timeoutMs: AI_TIMEOUT_MS };
    } catch (e) {
      const err = e as { message?: string; status?: number };
      gemini = { configured: true, model: process.env.GEMINI_MODEL, ok: false, ms: Date.now() - started, status: err.status ?? null, error: (err.message ?? "").slice(0, 400) };
    }
  }

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      admin: isAdmin,
      env,
      database: { foodsRows: foods ?? null, error: foodsErr?.message ?? null },
      you: { onboarded: profile?.onboarded ?? null, diet: profile?.diet_type ?? null, aiConsent: consent?.granted ?? false, aiUsageRecent: usage ?? [] },
      gemini,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
