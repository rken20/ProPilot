/**
 * Deleting a listing for good is for the app admin only. Everyone else changes
 * its status (sold, reserved, archived) and keeps the record.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const ADMIN = "00000000-0000-0000-0000-00000000d0a1"; // the app admin, owner of their own business
const OWNER = "00000000-0000-0000-0000-00000000d0b1"; // an ordinary business owner
const AGENT = "00000000-0000-0000-0000-00000000d0b2";

let db: PGlite;
let adminBiz: string;
let ownerBiz: string;

const addListing = async (biz: string, by: string, name: string) =>
  (
    await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, created_by) values ($1, $2, 'lot', 'Pototan', 100000000, $3) returning id`,
      [biz, name, by],
    )
  ).rows[0]!.id;
const exists = async (id: string) => (await db.query(`select 1 from public.properties where id = $1`, [id])).rows.length === 1;
const del = (who: string, id: string) => as(db, who, () => db.query(`delete from public.properties where id = $1`, [id]));

beforeAll(async () => {
  db = await freshDb();
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
     ('${ADMIN}', 'admin@example.test', '{}'), ('${OWNER}', 'owner@example.test', '{}'), ('${AGENT}', 'agent@example.test', '{}');`,
  );
  await db.query(`update public.profiles set is_superadmin = true where id = $1`, [ADMIN]);
  adminBiz = await as(db, ADMIN, async () => (await db.query<{ id: string }>(`select public.create_business('Sample Property (test)') as id`)).rows[0]!.id);
  ownerBiz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Owner Realty (test)') as id`)).rows[0]!.id);
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [ownerBiz, AGENT]);
});

describe("deleting a listing", () => {
  it("is refused for a business owner and their team: the listing stays", async () => {
    const id = await addListing(ownerBiz, OWNER, "Owner's lot");
    await del(OWNER, id);
    await del(AGENT, id);
    expect(await exists(id)).toBe(true);
  });

  it("works for the app admin in their own business, and takes its inquiries with it", async () => {
    const id = await addListing(adminBiz, ADMIN, "Sample lot");
    await db.query(`insert into public.listing_views (property_id, business_id, day, views) values ($1, $2, current_date, 3)`, [id, adminBiz]);
    await del(ADMIN, id);
    expect(await exists(id)).toBe(false);
    expect((await db.query(`select 1 from public.listing_views where property_id = $1`, [id])).rows).toHaveLength(0);
  });

  it("isn't open to the app admin in someone else's business", async () => {
    const id = await addListing(ownerBiz, OWNER, "Not theirs");
    await del(ADMIN, id);
    expect(await exists(id)).toBe(true);
  });
});

describe("everyone else changes the status instead", () => {
  it("lets the owner mark a listing sold, reserved or archived", async () => {
    const id = await addListing(ownerBiz, OWNER, "For status");
    for (const status of ["reserved", "sold", "archived", "available"]) {
      await as(db, OWNER, () => db.query(`update public.properties set status = $2 where id = $1`, [id, status]));
      expect((await db.query<{ status: string }>(`select status from public.properties where id = $1`, [id])).rows[0]!.status).toBe(status);
    }
  });
});
