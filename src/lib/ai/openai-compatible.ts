import "server-only";
import { AiProviderError, type AiProvider } from "./gateway";
import { CallError, callWithFallback } from "./retry";
import { AI_TIMEOUT_MS } from "./gemini";

/**
 * Provider for any OpenAI-compatible Chat Completions API (D-033). First used for Groq running Qwen.
 * VERIFIED 2026-11-20 (console.groq.com/docs): base URL https://api.groq.com/openai/v1, Bearer auth,
 * response_format {type:"json_schema", json_schema:{name, strict, schema}}, image input as image_url data URLs,
 * 429 + retry-after when rate-limited; qwen/qwen3.8-27b accepts text + images and reasoning_effort "none".
 * The model name comes ONLY from env (ai-recipe-pipeline invariant 2).
 *
 * Env: GROQ_API_KEY, GROQ_MODEL (e.g. qwen/qwen3.8-27b), optional GROQ_FALLBACK_MODELS (comma-separated),
 * GROQ_BASE_URL (default https://api.groq.com/openai/v1), GROQ_REASONING_EFFORT (default "none" = fast instruct mode;
 * set to "" to omit for models that don't support it).
 */
export function groqProviderFromEnv(): AiProvider | null {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const main = process.env.GROQ_MODEL?.trim();
  if (!apiKey || !main) return null;
  const baseUrl = (process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const models = [main, ...(process.env.GROQ_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean)].filter((m, i, a) => a.indexOf(m) === i);
  const effortEnv = process.env.GROQ_REASONING_EFFORT;
  const reasoningEffort = effortEnv === undefined ? "none" : effortEnv.trim();
  return openAiCompatibleProvider({ name: "groq", baseUrl, apiKey, models, reasoningEffort });
}

export function openAiCompatibleProvider(cfg: { name: string; baseUrl: string; apiKey: string; models: string[]; reasoningEffort?: string; fetchImpl?: typeof fetch }): AiProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    async generateJson({ prompt, jsonSchema, image }) {
      const content = image
        ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.dataBase64}` } },
          ]
        : prompt;
      try {
        const { value, model, attempts } = await callWithFallback(
          cfg.models,
          async (model, remainingMs) => {
            let res: Response;
            try {
              res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
                body: JSON.stringify({
                  model,
                  messages: [{ role: "user", content }],
                  temperature: 0.7,
                  // Best-effort schema mode: our schemas have optional fields, which strict mode forbids. zod validates after.
                  response_format: { type: "json_schema", json_schema: { name: "result", strict: false, schema: jsonSchema } },
                  ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
                }),
                signal: AbortSignal.timeout(remainingMs),
              });
            } catch (e) {
              const name = (e as Error).name;
              if (name === "AbortError" || name === "TimeoutError") throw new CallError("timed out", 504);
              throw new CallError(`network: ${(e as Error).message}`);
            }
            if (!res.ok) {
              const body = (await res.text().catch(() => "")).slice(0, 300);
              throw new CallError(`${cfg.name} HTTP ${res.status}: ${body}`, res.status);
            }
            const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
            const text = data.choices?.[0]?.message?.content;
            if (!text) throw new CallError("empty response", 502);
            return text;
          },
          { deadlineMs: AI_TIMEOUT_MS },
        );
        console.info(`[ai] ${cfg.name} ok model=${model} ${attempts.map((a) => `${a.model}:${a.status ?? "ok"}:${a.ms}ms`).join(" ")}`);
        return value;
      } catch (e) {
        const err = e as CallError;
        console.error(`[ai] ${cfg.name} failed status=${err.status ?? "?"} ${err.message.slice(0, 300)}`);
        throw new AiProviderError(err.message, err.status);
      }
    },
  };
}
