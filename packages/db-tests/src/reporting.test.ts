/** Reporting timestamps are set by the database from real status changes, never by clients. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000008a1";
const OTHER_OWNER = "00000000-0000-0000-0000-0000000008b1";
const BUYER = "00000000-0000-0000-0000-0000000008f1";

let db: PGlite;
let biz: string;
let prop: string;

type Row = { status: string; first_response_at: string | null; responded_by: string | null; closed_at: string | null };
const lead = (id: string) =>
  db.query<Row>(`select status, first_response_at, responded_by, closed_at from public.viewing_requests where id = $1`, [id]).then((r) => r.rows[0]!);

async function newRequest(): Promise<string> {
  await db.query(`delete from public.viewing_requests where buyer_id = $1`, [BUYER]);
  return as(db, BUYER, async () =>
    (
      await db.query<{ id: string }>(
        `insert into public.viewing_requests (business_id, property_id, buyer_id, buyer_name, buyer_phone, first_response_at, responded_by, closed_at)
         values ($1, $2, $3, 'Buyer (test)', '09170000000', now(), $3, now()) returning id`,
        [biz, prop, BUYER],
      )
    ).rows[0]!.id,
  );
}

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', '{}'), ('${OTHER_OWNER}', 'other@example.test', '{}'),
      ('${BUYER}', 'buyer@example.test', '{"account_type":"buyer"}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('R Realty (test)') as id`)).rows[0]!.id);
  await as(db, OTHER_OWNER, () => db.query(`select public.create_business('Other (test)')`));
  prop = await as(db, OWNER, async () =>
    (
      await db.query<{ id: string }>(
        `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public)
         values ($1, 'Condo (test)', 'condominium', 'Pasig', 100, $2, true) returning id`,
        [biz, OWNER],
      )
    ).rows[0]!.id,
  );
});

describe("viewing request tracking", () => {
  it("ignores timestamps a buyer sends", async () => {
    const id = await newRequest();
    expect(await lead(id)).toMatchObject({ first_response_at: null, responded_by: null, closed_at: null });
  });

  it("records the first response and who made it", async () => {
    const id = await newRequest();
    await as(db, OWNER, () => db.query(`update public.viewing_requests set status = 'contacted' where id = $1`, [id]));
    const r = await lead(id);
    expect(r.first_response_at).not.toBeNull();
    expect(r.responded_by).toBe(OWNER);
    const first = r.first_response_at;
    await as(db, OWNER, () => db.query(`update public.viewing_requests set status = 'scheduled' where id = $1`, [id]));
    expect((await lead(id)).first_response_at).toEqual(first);
  });

  it("can't be forged by a direct update", async () => {
    const id = await newRequest();
    await as(db, OWNER, () =>
      db.query(`update public.viewing_requests set first_response_at = '2020-01-01', responded_by = $2 where id = $1`, [id, OTHER_OWNER]),
    );
    expect(await lead(id)).toMatchObject({ first_response_at: null, responded_by: null });
  });

  it("sets and clears the closed time", async () => {
    const id = await newRequest();
    await as(db, OWNER, () => db.query(`update public.viewing_requests set status = 'closed' where id = $1`, [id]));
    expect((await lead(id)).closed_at).not.toBeNull();
    await as(db, OWNER, () => db.query(`update public.viewing_requests set status = 'contacted' where id = $1`, [id]));
    expect((await lead(id)).closed_at).toBeNull();
  });

  it("doesn't count a buyer cancelling as a team response", async () => {
    const id = await newRequest();
    await as(db, BUYER, () => db.query(`update public.viewing_requests set status = 'closed' where id = $1`, [id]));
    const r = await lead(id);
    expect(r.responded_by).toBeNull();
    expect(r.closed_at).not.toBeNull();
  });
});

describe("sold date", () => {
  it("is set when a listing is marked sold and can't be typed in", async () => {
    await as(db, OWNER, () => db.query(`update public.properties set sold_at = '2020-01-01' where id = $1`, [prop]));
    expect((await db.query<{ sold_at: string | null }>(`select sold_at from public.properties where id = $1`, [prop])).rows[0]!.sold_at).toBeNull();
    await as(db, OWNER, () => db.query(`update public.properties set status = 'sold' where id = $1`, [prop]));
    expect((await db.query<{ sold_at: string | null }>(`select sold_at from public.properties where id = $1`, [prop])).rows[0]!.sold_at).not.toBeNull();
    await as(db, OWNER, () => db.query(`update public.properties set status = 'available' where id = $1`, [prop]));
  });
});

describe("listing question events", () => {
  it("are visible to the business only and written by the server only", async () => {
    await db.query(`insert into public.listing_question_events (business_id, property_id) values ($1, $2)`, [biz, prop]);
    const own = await as(db, OWNER, () => db.query(`select * from public.listing_question_events`));
    const other = await as(db, OTHER_OWNER, () => db.query(`select * from public.listing_question_events`));
    expect(own.rows).toHaveLength(1);
    expect(other.rows).toHaveLength(0);
    await expect(
      as(db, BUYER, () => db.query(`insert into public.listing_question_events (business_id, property_id) values ($1, $2)`, [biz, prop])),
    ).rejects.toThrow(/row-level security/);
  });
});
