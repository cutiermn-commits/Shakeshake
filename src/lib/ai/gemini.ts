import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { AiProviderError, type AiProvider } from "./gateway";
import { CallError, callWithFallback } from "./retry";

/** Overall cap per AI request, including retries, so the user always gets an answer (well inside Vercel's 300 s). */
export const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 45_000);

/**
 * Gemini provider. Model names ALWAYS come from env, never hard-coded (ai-recipe-pipeline invariant 2):
 *   GEMINI_MODEL            main model
 *   GEMINI_FALLBACK_MODELS  optional, comma-separated backups tried when the main one is busy (503) or rate-limited (429)
 * Busy models are retried once after a short pause (see retry.ts). Structured output via responseMimeType +
 * responseJsonSchema; abortSignal / thinkingConfig verified in the installed @google/genai type definitions.
 * Optional GEMINI_THINKING_LEVEL (MINIMAL | LOW | MEDIUM | HIGH) — only if your models support it.
 */
export function geminiProviderFromEnv(): AiProvider | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const main = process.env.GEMINI_MODEL?.trim();
  if (!apiKey || !main) return null;
  const models = [main, ...(process.env.GEMINI_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean)].filter((m, i, a) => a.indexOf(m) === i);
  const ai = new GoogleGenAI({ apiKey });
  const level = process.env.GEMINI_THINKING_LEVEL?.trim().toUpperCase();
  const thinkingConfig = level && level in ThinkingLevel ? { thinkingLevel: ThinkingLevel[level as keyof typeof ThinkingLevel] } : undefined;

  return {
    async generateJson({ prompt, jsonSchema, image }) {
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
      if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.dataBase64 } });
      parts.push({ text: prompt });
      try {
        const { value, model, attempts } = await callWithFallback(
          models,
          async (model, remainingMs) => {
            try {
              const res = await ai.models.generateContent({
                model,
                contents: [{ role: "user", parts }],
                config: {
                  responseMimeType: "application/json",
                  responseJsonSchema: jsonSchema,
                  temperature: 0.8,
                  abortSignal: AbortSignal.timeout(remainingMs),
                  ...(thinkingConfig ? { thinkingConfig } : {}),
                },
              });
              if (!res.text) throw new CallError("empty response", 502);
              return res.text;
            } catch (e) {
              if (e instanceof CallError) throw e;
              const name = (e as Error).name;
              if (name === "AbortError" || name === "TimeoutError") throw new CallError("timed out", 504);
              if (e instanceof ApiError) throw new CallError(e.message, e.status);
              throw new CallError((e as Error).message);
            }
          },
          { deadlineMs: AI_TIMEOUT_MS },
        );
        console.info(`[ai] gemini ok model=${model} tries=${attempts.length} ${attempts.map((a) => `${a.model}:${a.status ?? "ok"}:${a.ms}ms`).join(" ")}`);
        return value;
      } catch (e) {
        const err = e as CallError;
        console.error(`[ai] gemini failed status=${err.status ?? "?"} ${err.message.slice(0, 300)}`);
        throw new AiProviderError(err.message, err.status);
      }
    },
  };
}
