/**
 * Shared test harness: runs every migration in an in-memory Postgres with a
 * minimal stand-in for Supabase's auth schema, and lets tests act as a user.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(import.meta.dirname, "../../../supabase/migrations");

const AUTH_STUB = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role authenticated nologin;
  grant usage on schema auth to authenticated;

  -- Minimal stand-in for Supabase Storage.
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text,
    owner uuid default nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`;

const GRANTS = `
  grant usage on schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`;

export const ANA = "00000000-0000-0000-0000-00000000000a"; // owner of Business A
export const BEN = "00000000-0000-0000-0000-00000000000b"; // owner of Business B
export const CARL = "00000000-0000-0000-0000-00000000000c"; // agent in Business A


export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const file of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(GRANTS);
  return db;
}

/** Run `fn` as a signed-in user, subject to RLS. */
export async function as<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
