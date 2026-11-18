import { describe, expect, it } from "vitest";
import { CallError, callWithFallback } from "./retry";

const fast = { deadlineMs: 60_000, sleep: async () => {} };

function scripted(script: Record<string, (number | "ok")[]>) {
  const calls: string[] = [];
  const fn = async (model: string) => {
    calls.push(model);
    const next = script[model].shift();
    if (next === "ok") return `${model}-result`;
    throw new CallError(`status ${next}`, next as number);
  };
  return { fn, calls };
}

describe("callWithFallback (Gemini busy handling)", () => {
  it("retries a busy model once and succeeds", async () => {
    const { fn, calls } = scripted({ main: [503, "ok"] });
    const r = await callWithFallback(["main"], fn, fast);
    expect(r.value).toBe("main-result");
    expect(calls).toEqual(["main", "main"]);
  });
  it("moves to the fallback model when the main one stays busy", async () => {
    const { fn, calls } = scripted({ main: [503, 503], backup: ["ok"] });
    const r = await callWithFallback(["main", "backup"], fn, fast);
    expect(r.model).toBe("backup");
    expect(calls).toEqual(["main", "main", "backup"]);
  });
  it("skips straight to the fallback on 429 (quota) without retrying", async () => {
    const { fn, calls } = scripted({ main: [429], backup: ["ok"] });
    await callWithFallback(["main", "backup"], fn, fast);
    expect(calls).toEqual(["main", "backup"]);
  });
  it("gives up immediately on a bad model name or key (4xx)", async () => {
    const { fn, calls } = scripted({ main: [404], backup: ["ok"] });
    await expect(callWithFallback(["main", "backup"], fn, fast)).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual(["main"]);
  });
  it("reports the last error when every model is busy", async () => {
    const { fn } = scripted({ main: [503, 503] });
    await expect(callWithFallback(["main"], fn, fast)).rejects.toMatchObject({ status: 503 });
  });
  it("stops when the deadline is used up", async () => {
    let t = 0;
    const { fn } = scripted({ main: [503, 503] });
    await expect(callWithFallback(["main"], fn, { deadlineMs: 3000, sleep: async () => void (t += 2500), now: () => t })).rejects.toMatchObject({ status: 503 });
  });
});
