/**
 * RLS test harness: runs the real migrations on PGlite (Postgres compiled to WASM) with a minimal
 * stub of Supabase's `auth` and `storage` schemas, then impersonates users the way PostgREST does
 * (role `authenticated` + request.jwt.claims). ASSUMPTION: the stubs mirror Supabase's auth.uid() /
 * auth.jwt() / storage.foldername() semantics; final confirmation is running the same tests
 * against a Supabase project (documented in docs/RUNBOOK.md).
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
grant usage on schema auth, storage to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on all functions in schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
alter table storage.objects enable row level security;
`;

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUB);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  await db.exec(`grant all on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);
  return db;
}

export type Q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

/** Run fn as a given user (or as service role when uid = "service"). Rolls back on error. */
export async function as<T>(db: PGlite, uid: string | "service" | "anon", fn: (q: Q) => Promise<T>, opts: { admin?: boolean } = {}): Promise<T> {
  return db.transaction(async (tx) => {
    if (uid === "service") await tx.exec("set local role service_role");
    else if (uid === "anon") await tx.exec("set local role anon");
    else {
      const claims = JSON.stringify({ sub: uid, role: "authenticated", app_metadata: opts.admin ? { role: "admin" } : {} });
      await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      await tx.exec("set local role authenticated");
    }
    const q: Q = async (sql, params) => (await tx.query(sql, params)).rows as never;
    return fn(q);
  });
}

export async function makeUser(db: PGlite, id: string, name: string, inviteCode: string) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await as(db, id, (q) => q("select public.redeem_invite($1, $2)", [inviteCode, name]));
}

export async function grantConsent(db: PGlite, uid: string, purpose: string, granted = true) {
  await as(db, uid, (q) => q("insert into public.consents (user_id, purpose, granted, version, granted_at) values ($1, $2, $3, 'v1', now())", [uid, purpose, granted]));
}
