import "server-only";
import { chainProviders } from "./chain";
import { geminiProviderFromEnv } from "./gemini";
import { groqProviderFromEnv } from "./openai-compatible";
import type { AiProvider } from "./gateway";

/** Configured providers in priority order. AI_PROVIDER_ORDER (e.g. "groq,gemini") overrides the default. */
export function configuredProviders(): { name: string; provider: AiProvider }[] {
  const all: Record<string, AiProvider | null> = { groq: groqProviderFromEnv(), gemini: geminiProviderFromEnv() };
  const order = (process.env.AI_PROVIDER_ORDER ?? "groq,gemini").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s in all);
  return order.filter((n, i, a) => a.indexOf(n) === i && all[n]).map((name) => ({ name, provider: all[name]! }));
}

export function aiProviderFromEnv(): AiProvider | null {
  return chainProviders(configuredProviders());
}
