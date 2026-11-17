import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { AiProviderError, type AiProvider } from "./gateway";

/**
 * Gemini provider. Model name ALWAYS comes from env (GEMINI_MODEL) — never hard-coded
 * (ai-recipe-pipeline invariant 2). Uses structured output via responseMimeType +
 * responseJsonSchema (fields present in @google/genai GenerateContentConfig, verified in the
 * installed SDK's type definitions).
 */
export function geminiProviderFromEnv(): AiProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return null;
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generateJson({ prompt, jsonSchema, image }) {
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
      if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.dataBase64 } });
      parts.push({ text: prompt });
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            temperature: 0.8,
          },
        });
        const text = res.text;
        if (!text) throw new AiProviderError("empty response");
        return text;
      } catch (e) {
        if (e instanceof AiProviderError) throw e;
        if (e instanceof ApiError) throw new AiProviderError(e.message, e.status);
        throw new AiProviderError((e as Error).message);
      }
    },
  };
}
