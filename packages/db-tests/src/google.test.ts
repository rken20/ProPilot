/** Viewing times, Google tokens kept server-only, and business integration visibility. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000003a1";
const OTHER_OWNER = "00000000-0000-0000-0000-0000000003b1";
const BUYER = "00000000-0000-0000-0000-0000000003f1";

let db: PGlite;
let biz: string;
let otherBiz: string;
let requestId: string;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', '{}'), ('${OTHER_OWNER}', 'other@example.test', '{}'),
      ('${BUYER}', 'buyer@example.test', '{"account_type":"buyer"}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('G Realty (test)') as id`)).rows[0]!.id);
  otherBiz = await as(db, OTHER_OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Other (test)') as id`)).rows[0]!.id);
  const prop = await as(db, OWNER, async () =>
    (await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public)
       values ($1, 'Lot (test)', 'lot', 'Iloilo', 100, $2, true) returning id`,
      [biz, OWNER],
    )).rows[0]!.id,
  );
  requestId = await as(db, BUYER, async () =>
    (await db.query<{ id: string }>(
      `insert into public.viewing_requests (business_id, property_id, buyer_id, buyer_name, buyer_phone, scheduled_at, calendar_event_id)
       values ($1, $2, $3, 'Buyer (test)', '09170000000', now(), 'forged') returning id`,
      [biz, prop, BUYER],
    )).rows[0]!.id,
  );
  // Server-side rows (service role bypasses RLS).
  await db.query(
    `insert into public.google_connections (user_id, google_email, refresh_token_enc, scopes) values ($1, 'owner@gmail.test', 'v1.secret', '{drive.file}')`,
    [OWNER],
  );
  await db.query(`insert into public.business_integrations (business_id, spreadsheet_url) values ($1, 'https://docs.google.com/x')`, [biz]);
});

describe("viewing times", () => {
  it("ignores a viewing time or event a buyer sends with the request", async () => {
    const { rows } = await db.query<{ scheduled_at: string | null; calendar_event_id: string | null }>(
      `select scheduled_at, calendar_event_id from public.viewing_requests where id = $1`,
      [requestId],
    );
    expect(rows[0]).toEqual({ scheduled_at: null, calendar_event_id: null });
  });

  it("lets the agent set a viewing time", async () => {
    await as(db, OWNER, () =>
      db.query(`update public.viewing_requests set status = 'scheduled', scheduled_at = '2026-11-20T02:00:00Z' where id = $1`, [requestId]),
    );
    const { rows } = await db.query<{ status: string }>(`select status from public.viewing_requests where id = $1`, [requestId]);
    expect(rows[0]!.status).toBe("scheduled");
  });

  it("stops the buyer from changing the viewing time", async () => {
    await expect(
      as(db, BUYER, () => db.query(`update public.viewing_requests set scheduled_at = now() where id = $1`, [requestId])),
    ).rejects.toThrow(/only cancel/);
  });
});

describe("Google connections", () => {
  it("never exposes tokens to any signed-in user, even the owner", async () => {
    for (const user of [OWNER, OTHER_OWNER, BUYER]) {
      const { rows } = await as(db, user, () => db.query(`select * from public.google_connections`));
      expect(rows).toHaveLength(0);
    }
  });

  it("tells a user only about their own connection, without the token", async () => {
    const mine = await as(db, OWNER, () => db.query<Record<string, unknown>>(`select * from public.my_google_connection()`));
    expect(mine.rows[0]).toMatchObject({ google_email: "owner@gmail.test", has_calendar: false });
    expect(Object.keys(mine.rows[0]!)).not.toContain("refresh_token_enc");
    const theirs = await as(db, OTHER_OWNER, () => db.query(`select * from public.my_google_connection()`));
    expect(theirs.rows).toHaveLength(0);
  });

  it("can't be written by a signed-in user", async () => {
    await expect(
      as(db, BUYER, () =>
        db.query(`insert into public.google_connections (user_id, google_email, refresh_token_enc) values ($1, 'x', 'y')`, [BUYER]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("business integrations", () => {
  it("are visible to the business's own team only", async () => {
    const mine = await as(db, OWNER, () => db.query(`select * from public.business_integrations`));
    const other = await as(db, OTHER_OWNER, () => db.query(`select * from public.business_integrations`));
    const buyer = await as(db, BUYER, () => db.query(`select * from public.business_integrations`));
    expect(mine.rows).toHaveLength(1);
    expect(other.rows).toHaveLength(0);
    expect(buyer.rows).toHaveLength(0);
    void otherBiz;
  });
});
