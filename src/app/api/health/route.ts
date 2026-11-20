import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AI_TIMEOUT_MS } from "@/lib/ai/gemini";
import { configuredProviders } from "@/lib/ai/providers";
import { jsonSchemaFor } from "@/lib/ai/schemas";

/**
 * Owner diagnostics: open /api/health in the browser while signed in as the admin.
 * Shows WHICH settings are present (never their values), database reachability, your AI consent,
 * today's AI usage and a tiny timed test call to EACH configured AI provider (Groq, Gemini). Not counted in the quota.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const role = (claims?.claims?.app_metadata as { role?: string } | undefined)?.role;
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Sign in first, then open this page again." }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ error: "Admins only. See docs/RUNBOOK.md §1 step 8." }, { status: 403 });
  const uid = claims.claims.sub as string;

  const env = Object.fromEntries(
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "GROQ_API_KEY", "GROQ_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL", "AI_GLOBAL_DAILY_CAP", "CRON_SECRET", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].map((k) => [
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

  const ai: Record<string, unknown>[] = [];
  for (const { name, provider } of configuredProviders()) {
    const started = Date.now();
    try {
      const text = await provider.generateJson({
        prompt: 'Return JSON {"dish": "<one South Indian protein-rich dish name>"}.',
        jsonSchema: jsonSchemaFor(z.object({ dish: z.string() })),
      });
      ai.push({ provider: name, ok: true, ms: Date.now() - started, sample: text.slice(0, 120) });
    } catch (e) {
      const err = e as { message?: string; status?: number };
      ai.push({ provider: name, ok: false, ms: Date.now() - started, status: err.status ?? null, error: (err.message ?? "").slice(0, 400) });
    }
  }
  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      env,
      database: { foodsRows: foods ?? null, error: foodsErr?.message ?? null },
      you: { onboarded: profile?.onboarded ?? null, diet: profile?.diet_type ?? null, aiConsent: consent?.granted ?? false, aiUsageRecent: usage ?? [] },
      ai: { order: process.env.AI_PROVIDER_ORDER ?? "groq,gemini", timeoutMs: AI_TIMEOUT_MS, models: { groq: process.env.GROQ_MODEL ?? null, gemini: process.env.GEMINI_MODEL ?? null }, results: ai },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
