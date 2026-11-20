import type { AiProvider } from "./gateway";
import { AiProviderError } from "./gateway";

/**
 * Try providers in order (D-033: Groq/Qwen → Gemini). Any provider failure — busy, rate-limited, timeout,
 * bad key — moves on to the next; the last error is reported. Output validation stays in the gateway.
 */
export function chainProviders(providers: { name: string; provider: AiProvider }[]): AiProvider | null {
  if (!providers.length) return null;
  if (providers.length === 1) return providers[0].provider;
  return {
    async generateJson(args) {
      let last: unknown = null;
      for (const { name, provider } of providers) {
        try {
          return await provider.generateJson(args);
        } catch (e) {
          last = e;
          console.warn(`[ai] provider ${name} failed, trying next: ${(e as Error).message.slice(0, 160)}`);
        }
      }
      throw last instanceof AiProviderError ? last : new AiProviderError(String((last as Error)?.message ?? last));
    },
  };
}
