/** Billing: only owners and admins see payments, nobody writes them from the app, and only a super admin's confirmation extends a plan. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-000000000da1";
const AGENT = "00000000-0000-0000-0000-000000000da2";
const OTHER = "00000000-0000-0000-0000-000000000db1";
const ADMIN = "00000000-0000-0000-0000-000000000dee";

let db: PGlite;
let biz: string;
let basic: string;

const pay = async (reference: string, months = 1) =>
  (
    await db.query<{ id: string }>(
      `insert into public.payments (business_id, plan_id, months, amount_minor, reference, payer_name, submitted_by)
       values ($1, $2, $3, 49900, $4, 'Ken D.', $5) returning id`,
      [biz, basic, months, reference, OWNER],
    )
  ).rows[0]!.id;
const sub = () =>
  db
    .query<{ start: string; end: string }>(`select current_period_start::text as start, current_period_end::text as end from public.subscriptions where business_id = $1`, [biz])
    .then((r) => r.rows[0]);

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'o@example.test', '{}'), ('${AGENT}', 'a@example.test', '{}'), ('${OTHER}', 'x@example.test', '{}'), ('${ADMIN}', 's@example.test', '{}');
  `);
  await db.query(`update public.profiles set is_superadmin = true where id = $1`, [ADMIN]);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('B Realty (test)') as id`)).rows[0]!.id);
  await as(db, OTHER, () => db.query(`select public.create_business('Other (test)')`));
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [biz, AGENT]);
  basic = (await db.query<{ id: string }>(`select id from public.plans where code = 'basic'`)).rows[0]!.id;
});

describe("plans", () => {
  it("offers Free, Basic, Pro and Agency, with AI only on the paid plans", async () => {
    const plans = await as(db, OWNER, () =>
      db.query<{ code: string; price_minor: number }>(`select code, price_minor from public.plans where is_active order by sort_order`),
    );
    expect(plans.rows).toEqual([
      { code: "free", price_minor: 0 },
      { code: "basic", price_minor: 49900 },
      { code: "pro", price_minor: 99900 },
      { code: "agency", price_minor: 249900 },
    ]);
    const limits = await db.query<{ code: string; feature_key: string; limit: number | null }>(
      `select p.code, e.feature_key, e."limit" from public.plan_entitlements e join public.plans p on p.id = e.plan_id
       where p.is_active and e.feature_key in ('ai', 'home_finder_buyers', 'team_members', 'ai_replies') order by p.sort_order, e.feature_key`,
    );
    expect(limits.rows).toEqual([
      { code: "free", feature_key: "ai", limit: 0 },
      { code: "free", feature_key: "ai_replies", limit: 0 },
      { code: "free", feature_key: "home_finder_buyers", limit: 0 },
      { code: "free", feature_key: "team_members", limit: 1 },
      { code: "basic", feature_key: "ai", limit: null },
      { code: "basic", feature_key: "ai_replies", limit: 3000 },
      { code: "basic", feature_key: "home_finder_buyers", limit: 5 },
      { code: "basic", feature_key: "team_members", limit: 2 },
      { code: "pro", feature_key: "ai", limit: null },
      { code: "pro", feature_key: "ai_replies", limit: 6000 },
      { code: "pro", feature_key: "home_finder_buyers", limit: 20 },
      { code: "pro", feature_key: "team_members", limit: 5 },
      { code: "agency", feature_key: "ai", limit: null },
      { code: "agency", feature_key: "ai_replies", limit: 15000 },
      { code: "agency", feature_key: "home_finder_buyers", limit: 60 },
      { code: "agency", feature_key: "team_members", limit: 15 },
    ]);
  });
});

describe("payments", () => {
  it("can't be written from the app", async () => {
    await expect(
      as(db, OWNER, () =>
        db.query(`insert into public.payments (business_id, plan_id, amount_minor, reference, payer_name) values ($1, $2, 49900, '1234567890123', 'x')`, [biz, basic]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(db, OWNER, () => db.query(`insert into public.subscriptions (business_id, plan_id, current_period_start, current_period_end) values ($1, $2, now(), now() + interval '1 year')`, [biz, basic])),
    ).rejects.toThrow(/row-level security/);
  });

  it("are visible to owners and admins only; the plan is visible to the whole team", async () => {
    const id = await pay("1000000000001");
    expect((await as(db, OWNER, () => db.query(`select id from public.payments`))).rows).toHaveLength(1);
    expect((await as(db, AGENT, () => db.query(`select id from public.payments`))).rows).toHaveLength(0);
    expect((await as(db, OTHER, () => db.query(`select id from public.payments`))).rows).toHaveLength(0);
    await db.query(`select * from public.apply_payment($1, $2)`, [id, ADMIN]);
    expect((await as(db, AGENT, () => db.query(`select business_id from public.subscriptions`))).rows).toHaveLength(1);
    expect((await as(db, OTHER, () => db.query(`select business_id from public.subscriptions`))).rows).toHaveLength(0);
  });

  it("accept each GCash reference once, and one pending payment per business", async () => {
    await expect(pay("1000000000001")).rejects.toThrow(/duplicate key/);
    await pay("1000000000002");
    await expect(pay("1000000000003")).rejects.toThrow(/duplicate key/);
    await expect(pay("12345")).rejects.toThrow(/check constraint/);
  });

  it("extend from the end of the current period when renewing early", async () => {
    const before = await sub();
    const pending = (await db.query<{ id: string }>(`select id from public.payments where status = 'pending'`)).rows[0]!.id;
    await db.query(`select * from public.apply_payment($1, $2)`, [pending, ADMIN]);
    const after = await sub();
    expect(after!.start).toBe(before!.start);
    const months = await db.query<{ m: number }>(
      `select extract(month from age(current_period_end, current_period_start))::int as m from public.subscriptions where business_id = $1`,
      [biz],
    );
    expect(months.rows[0]!.m).toBe(2);
    await expect(db.query(`select * from public.apply_payment($1, $2)`, [pending, ADMIN])).rejects.toThrow(/not waiting for review/);
  });

  it("can only be confirmed by the server for a super admin", async () => {
    const id = await pay("1000000000004");
    await expect(db.query(`select * from public.apply_payment($1, $2)`, [id, OWNER])).rejects.toThrow(/super admin/);
    await expect(as(db, ADMIN, () => db.query(`select * from public.apply_payment($1, $2)`, [id, ADMIN]))).rejects.toThrow(/permission denied/);
  });

  it("free the reference again when rejected", async () => {
    await db.query(`update public.payments set status = 'rejected' where reference = '1000000000004'`);
    await expect(pay("1000000000004")).resolves.toBeTruthy();
  });
});

describe("buyer plans", () => {
  const BUYER = "00000000-0000-0000-0000-000000000df1";
  const BUYER2 = "00000000-0000-0000-0000-000000000df2";
  const buyerPay = async (buyer: string, reference: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.payments (buyer_id, plan_id, months, amount_minor, reference, payer_name, submitted_by)
         values ($1, $2, 1, 49900, $3, 'Maria S.', $1) returning id`,
        [buyer, basic, reference],
      )
    ).rows[0]!.id;

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data) values
        ('${BUYER}', 'b1@example.test', '{"account_type":"buyer"}'), ('${BUYER2}', 'b2@example.test', '{"account_type":"buyer"}');
    `);
  });

  it("belong to one payer: a business or a buyer, never both or neither", async () => {
    await expect(
      db.query(`insert into public.payments (business_id, buyer_id, plan_id, amount_minor, reference, payer_name) values ($1, $2, $3, 1, '2000000000001', 'x')`, [biz, BUYER, basic]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`insert into public.payments (plan_id, amount_minor, reference, payer_name) values ($1, 1, '2000000000002', 'x')`, [basic]),
    ).rejects.toThrow(/check constraint/);
  });

  it("are visible to that buyer only, and confirming gives the buyer the plan", async () => {
    const id = await buyerPay(BUYER, "2000000000003");
    await expect(buyerPay(BUYER, "2000000000004")).rejects.toThrow(/duplicate key/);
    expect((await as(db, BUYER, () => db.query(`select id from public.payments`))).rows).toHaveLength(1);
    expect((await as(db, BUYER2, () => db.query(`select id from public.payments`))).rows).toHaveLength(0);
    expect((await as(db, OWNER, () => db.query(`select id from public.payments where buyer_id is not null`))).rows).toHaveLength(0);

    await db.query(`select * from public.apply_payment($1, $2)`, [id, ADMIN]);
    expect((await as(db, BUYER, () => db.query(`select user_id from public.buyer_subscriptions`))).rows).toEqual([{ user_id: BUYER }]);
    expect((await as(db, BUYER2, () => db.query(`select user_id from public.buyer_subscriptions`))).rows).toHaveLength(0);
    // The business's own plan is untouched.
    expect((await db.query(`select count(*)::int as n from public.subscriptions`)).rows[0]).toEqual({ n: 1 });
  });

  it("can't be written by buyers", async () => {
    await expect(
      as(db, BUYER2, () =>
        db.query(`insert into public.buyer_subscriptions (user_id, plan_id, current_period_start, current_period_end) values ($1, $2, now(), now() + interval '1 year')`, [BUYER2, basic]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
