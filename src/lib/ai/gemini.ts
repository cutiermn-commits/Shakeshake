import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { AiProviderError, type AiProvider } from "./gateway";

/** Hard cap per AI request so the user always gets an answer (well inside Vercel's 300 s limit). */
export const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 45_000);

/**
 * Gemini provider. Model name ALWAYS comes from env (GEMINI_MODEL) — never hard-coded
 * (ai-recipe-pipeline invariant 2). Structured output via responseMimeType + responseJsonSchema;
 * abortSignal / thinkingConfig fields verified in the installed @google/genai type definitions.
 * Optional GEMINI_THINKING_LEVEL (MINIMAL | LOW | MEDIUM | HIGH) trades reasoning for speed — only set
 * it if your model supports thinking levels (otherwise the API rejects the request).
 */
export function geminiProviderFromEnv(): AiProvider | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  if (!apiKey || !model) return null;
  const ai = new GoogleGenAI({ apiKey });
  const level = process.env.GEMINI_THINKING_LEVEL?.trim().toUpperCase();
  const thinkingConfig = level && level in ThinkingLevel ? { thinkingLevel: ThinkingLevel[level as keyof typeof ThinkingLevel] } : undefined;

  return {
    async generateJson({ prompt, jsonSchema, image }) {
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
      if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.dataBase64 } });
      parts.push({ text: prompt });
      const started = Date.now();
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            temperature: 0.8,
            abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        });
        const text = res.text;
        console.info(`[ai] gemini ok model=${model} ms=${Date.now() - started} chars=${text?.length ?? 0}`);
        if (!text) throw new AiProviderError("empty response");
        return text;
      } catch (e) {
        const ms = Date.now() - started;
        if (e instanceof AiProviderError) throw e;
        if ((e as Error).name === "AbortError" || (e as Error).name === "TimeoutError") {
          console.error(`[ai] gemini timeout model=${model} ms=${ms}`);
          throw new AiProviderError(`timed out after ${ms} ms`, 504);
        }
        if (e instanceof ApiError) {
          console.error(`[ai] gemini api error model=${model} status=${e.status} ms=${ms} ${e.message.slice(0, 300)}`);
          throw new AiProviderError(e.message, e.status);
        }
        console.error(`[ai] gemini error model=${model} ms=${ms}`, e);
        throw new AiProviderError((e as Error).message);
      }
    },
  };
}
