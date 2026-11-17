// Concatenates supabase/migrations/*.sql into supabase/setup.sql (one paste in the Supabase SQL editor).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const dir = new URL("../supabase/migrations/", import.meta.url);
const parts = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => `\n-- ===================== supabase/migrations/${f} =====================\n${readFileSync(new URL(f, dir), "utf8")}`);
writeFileSync(new URL("../supabase/setup.sql", import.meta.url), `-- Shake Shake: complete database setup in ONE paste (Supabase → SQL Editor → New query → paste → Run).\n-- GENERATED from supabase/migrations/0001–0004 by scripts/gen-setup.mjs. Do not edit by hand. Safe to run once on an empty project.\n${parts.join("")}`);
