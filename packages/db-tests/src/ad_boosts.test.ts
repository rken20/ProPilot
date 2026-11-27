/**
 * Boosting: the ad sign-in stays server-only, the owner's spending limits are enforced by the
 * database, one boost runs per post, and the team (not agents) can see boosts.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000ab001";
const MARKETING = "00000000-0000-0000-0000-0000000ab002";
const AGENT = "00000000-0000-0000-0000-0000000ab003";
const OTHER = "00000000-0000-0000-0000-0000000ab004";

let db: PGlite;
let biz: string;
let post: string;

const boost = (over: Record<string, unknown> = {}) => {
  const row = { daily: 30000, days: 5, total: 150000, radius: 20, status: "active", ...over };
  return db.query<{ id: string }>(
    `insert into public.ad_boosts (business_id, facebook_post_id, ad_account_id, daily_budget_minor, days, total_minor, radius_km, area_label, status, approved_by)
     values ($1, $2, '123456', $3, $4, $5, $6, 'Within 20 km of Mandurriao', $7, $8) returning id`,
    [biz, post, row.daily, row.days, row.total, row.radius, row.status, OWNER],
  );
};

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'bo@example.test', '{}'), ('${MARKETING}', 'bm@example.test', '{}'), ('${AGENT}', 'ba@example.test', '{}'), ('${OTHER}', 'bx@example.test', '{}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Boost Realty (test)') as id`)).rows[0]!.id);
  await as(db, OTHER, () => db.query(`select public.create_business('Other Boost (test)')`));
  await db.query(
    `insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'marketing', 'active'), ($1, $3, 'agent', 'active')`,
    [biz, MARKETING, AGENT],
  );
  post = (
    await db.query<{ id: string }>(
      `insert into public.facebook_posts (business_id, page_id, page_name, kind, status, fb_post_id) values ($1, '111', 'Boost Page', 'video', 'published', '111_222') returning id`,
      [biz],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into public.meta_ad_connections (business_id, fb_user_id, user_token_enc, token_expires_at, ad_account_id, ad_account_name) values ($1, '999', 'enc', now() + interval '60 days', '123456', 'Main')`,
    [biz],
  );
});

describe("the ad sign-in", () => {
  it("is never visible or writable from the app, not even to the owner", async () => {
    expect((await as(db, OWNER, () => db.query(`select * from public.meta_ad_connections`))).rows).toHaveLength(0);
    await as(db, OWNER, () => db.query(`update public.meta_ad_connections set ad_account_id = '1'`));
    expect((await db.query<{ ad_account_id: string }>(`select ad_account_id from public.meta_ad_connections`)).rows[0]!.ad_account_id).toBe("123456");
    await expect(
      as(db, OWNER, () => db.query(`insert into public.meta_ad_connections (business_id, fb_user_id, user_token_enc, token_expires_at) values ($1, '1', 'x', now())`, [biz])),
    ).rejects.toThrow(/row-level security|duplicate key/);
  });
});

describe("boosts", () => {
  it("keep to the owner's limits: ₱100 to ₱1,000 a day, at most 14 days and ₱10,000 in all", async () => {
    await expect(boost({ daily: 100001, total: 500005 })).rejects.toThrow(/daily_budget_minor/);
    await expect(boost({ daily: 9999, total: 49995 })).rejects.toThrow(/daily_budget_minor/);
    await expect(boost({ daily: 80000, days: 14, total: 1120000 })).rejects.toThrow(/total_minor/);
    await expect(boost({ days: 15, total: 450000 })).rejects.toThrow(/days/);
    // The total must be the daily amount times the days.
    await expect(boost({ total: 100000 })).rejects.toThrow(/total_minor/);
    await expect(boost({ radius: 10 })).rejects.toThrow(/radius_km/);
  });

  it("run one at a time per post", async () => {
    const first = (await boost()).rows[0]!.id;
    await expect(boost()).rejects.toThrow(/ad_boosts_one_running/);
    await db.query(`update public.ad_boosts set status = 'stopped' where id = $1`, [first]);
    await boost();
  });

  it("are seen by the owner and marketing, not by agents or other businesses, and written only by the server", async () => {
    expect((await as(db, OWNER, () => db.query(`select id from public.ad_boosts`))).rows).toHaveLength(2);
    expect((await as(db, MARKETING, () => db.query(`select id from public.ad_boosts`))).rows).toHaveLength(2);
    expect((await as(db, AGENT, () => db.query(`select id from public.ad_boosts`))).rows).toHaveLength(0);
    expect((await as(db, OTHER, () => db.query(`select id from public.ad_boosts`))).rows).toHaveLength(0);
    await as(db, OWNER, () => db.query(`update public.ad_boosts set daily_budget_minor = 100000`));
    expect((await db.query<{ n: number }>(`select max(daily_budget_minor) as n from public.ad_boosts`)).rows[0]!.n).toBe(30000);
    await expect(
      as(db, OWNER, () =>
        db.query(
          `insert into public.ad_boosts (business_id, facebook_post_id, ad_account_id, daily_budget_minor, days, total_minor, radius_km, area_label, approved_by) values ($1, $2, '1', 30000, 1, 30000, 20, 'x', $3)`,
          [biz, post, OWNER],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
