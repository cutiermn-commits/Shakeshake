import { describe, expect, it } from "vitest";
import { openAiCompatibleProvider } from "./openai-compatible";
import { chainProviders } from "./chain";
import { AiProviderError, type AiProvider } from "./gateway";

type Call = { url: string; body: Record<string, unknown>; auth: string | null };

function fakeFetch(responses: (Response | Error)[], calls: Call[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") });
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
}
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe("OpenAI-compatible provider (Groq · Qwen, D-033)", () => {
  it("sends a json_schema chat completion with bearer auth, model from config and reasoning_effort", async () => {
    const calls: Call[] = [];
    const p = openAiCompatibleProvider({ name: "groq", baseUrl: "https://api.example/openai/v1", apiKey: "k", models: ["qwen-test"], reasoningEffort: "none", fetchImpl: fakeFetch([ok('{"a":1}')], calls) });
    expect(await p.generateJson({ prompt: "hi", jsonSchema: { type: "object" } })).toBe('{"a":1}');
    expect(calls[0].url).toBe("https://api.example/openai/v1/chat/completions");
    expect(calls[0].auth).toBe("Bearer k");
    expect(calls[0].body).toMatchObject({ model: "qwen-test", reasoning_effort: "none", response_format: { type: "json_schema", json_schema: { strict: false, schema: { type: "object" } } } });
  });
  it("sends photos as an image_url data URL", async () => {
    const calls: Call[] = [];
    const p = openAiCompatibleProvider({ name: "groq", baseUrl: "https://x", apiKey: "k", models: ["m"], fetchImpl: fakeFetch([ok("{}")], calls) });
    await p.generateJson({ prompt: "plate", jsonSchema: {}, image: { mimeType: "image/jpeg", dataBase64: "QUJD" } });
    const content = (calls[0].body.messages as { content: { type: string; image_url?: { url: string } }[] }[])[0].content;
    expect(content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } });
  });
  it("maps HTTP 429 to a rate-limit error and tries the fallback model", async () => {
    const calls: Call[] = [];
    const p = openAiCompatibleProvider({ name: "groq", baseUrl: "https://x", apiKey: "k", models: ["a", "b"], fetchImpl: fakeFetch([new Response("slow down", { status: 429 }), ok("{}")], calls) });
    await p.generateJson({ prompt: "x", jsonSchema: {} });
    expect(calls.map((c) => c.body.model)).toEqual(["a", "b"]);
  });
  it("reports a bad key (401) immediately with its status", async () => {
    const p = openAiCompatibleProvider({ name: "groq", baseUrl: "https://x", apiKey: "bad", models: ["a", "b"], fetchImpl: fakeFetch([new Response("no", { status: 401 })], []) });
    await expect(p.generateJson({ prompt: "x", jsonSchema: {} })).rejects.toMatchObject({ status: 401 });
  });
});

describe("provider chain", () => {
  const failing = (status: number): AiProvider => ({ generateJson: async () => { throw new AiProviderError("nope", status); } });
  const working = (v: string): AiProvider => ({ generateJson: async () => v });
  it("uses the first provider that answers (Groq down → Gemini)", async () => {
    const c = chainProviders([{ name: "groq", provider: failing(503) }, { name: "gemini", provider: working("gemini-answer") }])!;
    expect(await c.generateJson({ prompt: "", jsonSchema: {} })).toBe("gemini-answer");
  });
  it("reports the last error when all fail, so the app falls back to the recipe library", async () => {
    const c = chainProviders([{ name: "groq", provider: failing(429) }, { name: "gemini", provider: failing(503) }])!;
    await expect(c.generateJson({ prompt: "", jsonSchema: {} })).rejects.toMatchObject({ status: 503 });
  });
  it("returns null with no providers configured", () => {
    expect(chainProviders([])).toBeNull();
  });
});
