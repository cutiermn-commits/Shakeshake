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
    expect(r).toBeGreaterThanOrEqual(120);
  });
});

describe("supabase/updates (one-paste updates for existing projects)", () => {
  it("applies on top of an existing database, twice, without errors", async () => {
    const db = new PGlite();
    await db.exec(STUB);
    await db.exec(readFileSync(path.resolve(import.meta.dirname, "../../supabase/setup.sql"), "utf8"));
    const update = readFileSync(path.resolve(import.meta.dirname, "../../supabase/updates/2026-11-19_recipe_library_v2.sql"), "utf8");
    await db.exec(update);
    await db.exec(update); // idempotent
    const [{ n }] = (await db.query<{ n: number }>("select count(*)::int n from public.recipes where prompt_version like 'library-%'")).rows;
    expect(n).toBeGreaterThanOrEqual(80);
    const [{ p }] = (await db.query<{ p: number }>("select count(*)::int p from public.foods where key = 'paneer'")).rows;
    expect(p).toBe(1);
  });

  it("2026-11-20 update adds copy + library v3, twice, and keeps only current lines active", async () => {
    const db = new PGlite();
    await db.exec(STUB);
    await db.exec(readFileSync(path.resolve(import.meta.dirname, "../../supabase/setup.sql"), "utf8"));
    await db.exec("insert into public.messages (id, category, text, active) values ('oldline', 'logged_thanks', 'Old line', true)");
    const update = readFileSync(path.resolve(import.meta.dirname, "../../supabase/updates/2026-11-20_messages_recipes_v3.sql"), "utf8");
    await db.exec(update);
    await db.exec(update); // idempotent
    const [{ n }] = (await db.query<{ n: number }>("select count(*)::int n from public.recipes where prompt_version like 'library-%'")).rows;
    expect(n).toBe(120);
    const [{ l }] = (await db.query<{ l: number }>("select count(*)::int l from public.messages where category in ('loading','chosen') and active")).rows;
    expect(l).toBeGreaterThanOrEqual(13);
    const [{ o }] = (await db.query<{ o: boolean }>("select active o from public.messages where id = 'oldline'")).rows;
    expect(o).toBe(false);
  });
});
