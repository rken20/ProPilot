/** Listings found on other sites: server writes, buyers read, saves stay private. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const BUYER = "00000000-0000-0000-0000-0000000005b1";
const OTHER = "00000000-0000-0000-0000-0000000005b2";

let db: PGlite;
let listing: string;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${BUYER}', 'b@example.test', '{"account_type":"buyer"}'),
      ('${OTHER}', 'o@example.test', '{"account_type":"buyer"}');
  `);
  // The server writes with the service role, which bypasses RLS (here: superuser).
  const { rows } = await db.query<{ id: string }>(
    `insert into public.external_listings (source_url, source_name, title, type, location, price_minor)
     values ('https://www.lamudi.com.ph/property/1', 'Lamudi', '2BR condo (test)', 'condominium', 'Mandaluyong', 480000000)
     returning id`,
  );
  listing = rows[0]!.id;
  await db.query(`insert into public.external_searches (query_key, listing_id) values ('condo|mandaluyong|', $1)`, [listing]);
});

describe("external listings", () => {
  it("lets a signed-in buyer read them", async () => {
    const { rows } = await as(db, BUYER, () => db.query(`select title from public.external_listings`));
    expect(rows).toHaveLength(1);
  });

  it("does not let a buyer add, change or delete them", async () => {
    await expect(
      as(db, BUYER, () =>
        db.query(
          `insert into public.external_listings (source_url, source_name, title) values ('https://evil.example/x', 'Evil', 'Fake (test)')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const upd = await as(db, BUYER, () => db.query(`update public.external_listings set price_minor = 1 returning id`));
    expect(upd.rows).toHaveLength(0);
    const del = await as(db, BUYER, () => db.query(`delete from public.external_listings returning id`));
    expect(del.rows).toHaveLength(0);
  });

  it("hides the search cache from clients", async () => {
    const { rows } = await as(db, BUYER, () => db.query(`select * from public.external_searches`));
    expect(rows).toHaveLength(0);
  });

  it("rejects links that aren't https", async () => {
    await expect(
      db.query(`insert into public.external_listings (source_url, source_name, title) values ('javascript:alert(1)', 'X', 'Bad (test)')`),
    ).rejects.toThrow(/check constraint/);
  });

  it("keeps each buyer's saved listings private", async () => {
    await as(db, BUYER, () => db.query(`insert into public.external_favorites (listing_id) values ($1)`, [listing]));
    const mine = await as(db, BUYER, () => db.query(`select * from public.external_favorites`));
    const theirs = await as(db, OTHER, () => db.query(`select * from public.external_favorites`));
    expect(mine.rows).toHaveLength(1);
    expect(theirs.rows).toHaveLength(0);
    await expect(
      as(db, OTHER, () =>
        db.query(`insert into public.external_favorites (user_id, listing_id) values ($1, $2)`, [BUYER, listing]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("does not let a buyer run the cleanup", async () => {
    await expect(as(db, BUYER, () => db.query(`select public.prune_external_listings()`))).rejects.toThrow(/permission denied/);
  });

  it("prunes old, unsaved listings but keeps saved ones", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.external_listings (source_url, source_name, title, last_seen_at)
       values ('https://www.lamudi.com.ph/property/2', 'Lamudi', 'Old lot (test)', now() - interval '40 days') returning id`,
    );
    await db.query(`update public.external_listings set last_seen_at = now() - interval '40 days' where id = $1`, [listing]);
    await db.query(`select public.prune_external_listings()`);
    const left = await db.query<{ id: string }>(`select id from public.external_listings`);
    expect(left.rows.map((r) => r.id)).toEqual([listing]); // saved by BUYER, so kept
    expect(left.rows.map((r) => r.id)).not.toContain(rows[0]!.id);
  });
});
