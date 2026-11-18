/**
 * Single AI gateway (CLAUDE.md engineering rule 4, ai-recipe-pipeline invariant 1):
 *   assertConsent('ai_processing') → consumeQuota() → call → validate (zod, one repair retry) → caller post-processes.
 * Dependencies are injected so the pipeline is unit-testable without network access.
 */
import type { z } from "zod";
import { jsonSchemaFor } from "./schemas";

export type AiKind = "suggest" | "swap" | "plan" | "plate";

export interface AiImage {
  mimeType: string;
  dataBase64: string;
}

export interface AiProvider {
  /** Returns the raw text of a JSON response. Throws AiProviderError on HTTP/API failure. */
  generateJson(args: { prompt: string; jsonSchema: unknown; image?: AiImage }): Promise<string>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export type QuotaResult = "ok" | "user_limit" | "global_limit";

export interface GatewayDeps {
  provider: AiProvider | null; // null when not configured (no key / no model)
  hasConsent(userId: string, purpose: "ai_processing"): Promise<boolean>;
  consumeQuota(userId: string, kind: AiKind): Promise<QuotaResult>;
  onEvent?(e: { userId: string; kind: AiKind; outcome: string }): void;
}

export type FailReason =
  | "not_configured"
  | "no_consent"
  | "quota_user"
  | "quota_global"
  | "rate_limited"
  | "invalid_output"
  | "timeout"
  | "provider_error";

export type AiResult<T> = { ok: true; data: T; attempts: number } | { ok: false; reason: FailReason; detail?: string };

export interface RunArgs<S extends z.ZodType> {
  userId: string;
  kind: AiKind;
  prompt: string;
  schema: S;
  image?: AiImage;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(trimmed);
}

export async function runAi<S extends z.ZodType>(deps: GatewayDeps, args: RunArgs<S>): Promise<AiResult<z.infer<S>>> {
  const done = (outcome: string) => deps.onEvent?.({ userId: args.userId, kind: args.kind, outcome });
  if (!deps.provider) return done("not_configured"), { ok: false, reason: "not_configured" };
  if (!(await deps.hasConsent(args.userId, "ai_processing"))) return done("no_consent"), { ok: false, reason: "no_consent" };

  const jsonSchema = jsonSchemaFor(args.schema);
  let prompt = args.prompt;
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const q = await deps.consumeQuota(args.userId, args.kind);
    if (q !== "ok") {
      const reason = q === "user_limit" ? "quota_user" : "quota_global";
      // On the repair attempt a quota stop means the first output was invalid.
      if (attempt === 2) return done("invalid_output"), { ok: false, reason: "invalid_output", detail: lastError };
      return done(reason), { ok: false, reason };
    }
    let raw: string;
    try {
      raw = await deps.provider.generateJson({ prompt, jsonSchema, image: args.image });
    } catch (e) {
      const status = e instanceof AiProviderError ? e.status : undefined;
      if (status === 429) return done("rate_limited"), { ok: false, reason: "rate_limited" };
      if (status === 504) return done("timeout"), { ok: false, reason: "timeout" };
      return done("provider_error"), { ok: false, reason: "provider_error", detail: (e as Error).message };
    }
    try {
      const parsed = args.schema.safeParse(parseJson(raw));
      if (parsed.success) return done("ok"), { ok: true, data: parsed.data, attempts: attempt };
      lastError = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = `not JSON: ${(e as Error).message}`;
    }
    prompt = `${args.prompt}\n\nYour previous answer was invalid (${lastError}). Fix it and return ONLY valid JSON matching the schema.`;
  }
  return done("invalid_output"), { ok: false, reason: "invalid_output", detail: lastError };
}

/** Friendly, on-tone copy for each failure (TONE_AND_COPY §5 error_friendly). */
export function failureCopy(reason: FailReason): string {
  switch (reason) {
    case "no_consent":
      return "AI help is off. You can switch it on in Settings → Privacy, or log it manually.";
    case "quota_user":
    case "quota_global":
    case "rate_limited":
      return "Too many recipe requests today! We'll be back tomorrow, fresher than idli batter.";
    case "timeout":
      return "The AI chef is taking too long today. Try again in a minute, or log it manually.";
    case "not_configured":
      return "The kitchen's a bit busy right now — manual entry works perfectly meanwhile.";
    default:
      return "Our AI chef dropped the ladle. Try again, or log it manually.";
  }
}
