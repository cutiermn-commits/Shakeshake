/**
 * Retry / fallback policy for AI calls when the provider is busy.
 * - 503 / 500 / 502 / network errors: retry the same model once after a short pause, then try the next model.
 * - 429 (quota or rate limit for that model): don't retry it; move to the next model.
 * - 400 / 401 / 403 / 404 (bad request, key, or model name): stop immediately — retrying can't help.
 * Everything stays inside one overall deadline.
 */
export interface Attempt {
  model: string;
  status?: number;
  ms: number;
  error?: string;
}

export class CallError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const RETRY_SAME = new Set([500, 502, 503, 504]);
const NEXT_MODEL = new Set([429, 500, 502, 503, 504]);

export async function callWithFallback<T>(
  models: string[],
  call: (model: string, remainingMs: number) => Promise<T>,
  opts: { deadlineMs: number; pauseMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number },
): Promise<{ value: T; model: string; attempts: Attempt[] }> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pause = opts.pauseMs ?? 1500;
  const end = now() + opts.deadlineMs;
  const attempts: Attempt[] = [];
  let last: CallError | null = null;

  for (const model of models) {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const remaining = end - now();
      if (remaining < 2000) throw last ?? new CallError("out of time", 504);
      const started = now();
      try {
        const value = await call(model, remaining);
        attempts.push({ model, ms: now() - started });
        return { value, model, attempts };
      } catch (e) {
        const err = e instanceof CallError ? e : new CallError((e as Error).message);
        attempts.push({ model, status: err.status, ms: now() - started, error: err.message.slice(0, 200) });
        last = err;
        if (err.status !== undefined && !NEXT_MODEL.has(err.status) && !RETRY_SAME.has(err.status)) throw err; // 4xx: give up
        if (tryNo === 0 && (err.status === undefined || RETRY_SAME.has(err.status))) {
          await sleep(pause);
          continue; // one more try on the same model
        }
        break; // next model
      }
    }
  }
  throw last ?? new CallError("no models configured", 500);
}
