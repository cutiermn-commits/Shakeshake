import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { STUB } from "./harness";

describe("supabase/setup.sql (one-paste setup)", () => {
  it("applies cleanly in a single run and seeds messages, foods and the recipe library", async () => {
    const db = new PGlite();
    await db.exec(STUB);
    await db.exec(readFileSync(path.resolve(import.meta.dirname, "../../supabase/setup.sql"), "utf8"));
    const [{ n }] = (await db.query<{ n: number }>("select count(*)::int n from public.foods")).rows;
    const [{ m }] = (await db.query<{ m: number }>("select count(*)::int m from public.messages")).rows;
    expect(n).toBeGreaterThan(150);
    expect(m).toBeGreaterThan(40);
    const [{ r }] = (await db.query<{ r: number }>("select count(*)::int r from public.recipes where prompt_version like 'library-%' and nutrition_status <> 'ai_estimate'")).rows;
    expect(r).toBeGreaterThanOrEqual(40);
  });
});
