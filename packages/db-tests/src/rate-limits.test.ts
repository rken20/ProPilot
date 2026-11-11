/** Abuse cases: request flooding and chat overuse. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000004a1";
const BUYER = "00000000-0000-0000-0000-0000000004f1";
const OTHER = "00000000-0000-0000-0000-0000000004f2";

let db: PGlite;
let biz: string;
const props: string[] = [];

const request = (buyer: string, property: string) =>
  as(db, buyer, () =>
    db.query(
      `insert into public.viewing_requests (business_id, property_id, buyer_id, buyer_name, buyer_phone)
       values ($1, $2, $3, 'Buyer (test)', '09170000000')`,
      [biz, property, buyer],
    ),
  );

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'o@example.test', '{}'),
      ('${BUYER}', 'b@example.test', '{"account_type":"buyer"}'),
      ('${OTHER}', 'c@example.test', '{"account_type":"buyer"}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Limits (test)') as id`)).rows[0]!.id);
  for (let i = 0; i < 12; i++) {
    const { rows } = await as(db, OWNER, () =>
      db.query<{ id: string }>(
        `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public)
         values ($1, $2, 'lot', 'Iloilo', 100, $3, true) returning id`,
        [biz, `Lot ${i} (test)`, OWNER],
      ),
    );
    props.push(rows[0]!.id);
  }
});

describe("viewing request limits", () => {
  it("allows one open request per listing", async () => {
    await request(BUYER, props[0]!);
    await expect(request(BUYER, props[0]!)).rejects.toThrow(/already have an open request/);
  });

  it("allows a new request once the old one is closed", async () => {
    await as(db, BUYER, () => db.query(`update public.viewing_requests set status = 'closed' where property_id = $1`, [props[0]]));
    await request(BUYER, props[0]!);
  });

  it("caps a buyer at 10 requests a day, without affecting other buyers", async () => {
    // 2 made above; 8 more reach the cap.
    for (let i = 1; i <= 8; i++) await request(BUYER, props[i]!);
    await expect(request(BUYER, props[9]!)).rejects.toThrow(/too many viewing requests/);
    await request(OTHER, props[9]!);
  });
});

describe("consume_rate_limit", () => {
  it("allows up to the limit, then refuses, per user and bucket", async () => {
    const hit = (user: string, bucket = "chat") =>
      as(db, user, async () => (await db.query<{ ok: boolean }>(`select public.consume_rate_limit($1, 3, 3600) as ok`, [bucket])).rows[0]!.ok);
    expect([await hit(BUYER), await hit(BUYER), await hit(BUYER)]).toEqual([true, true, true]);
    expect(await hit(BUYER)).toBe(false);
    expect(await hit(OTHER)).toBe(true);
    expect(await hit(BUYER, "other-bucket")).toBe(true);
  });

  it("refuses when signed out, and its table is closed to clients", async () => {
    const { rows } = await db.query<{ ok: boolean }>(`select public.consume_rate_limit('chat', 3, 3600) as ok`);
    expect(rows[0]!.ok).toBe(false);
    const read = await as(db, BUYER, () => db.query(`select * from public.rate_limit_counters`));
    expect(read.rows).toHaveLength(0);
  });
});
