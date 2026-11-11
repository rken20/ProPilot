/**
 * Guards for the whole schema, so a new table or function can't ship unsafe:
 * every public table has row-level security on, and every security-definer
 * function pins its search_path (otherwise a caller could shadow objects).
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, expect, it } from "vitest";
import { freshDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
});

it("enables row-level security on every public table", async () => {
  const { rows } = await db.query<{ table: string }>(
    `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`,
  );
  expect(rows.map((r) => r.table)).toEqual([]);
});

it("pins search_path on every security-definer function", async () => {
  const { rows } = await db.query<{ fn: string }>(
    `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
     order by 1`,
  );
  expect(rows.map((r) => r.fn)).toEqual([]);
});
