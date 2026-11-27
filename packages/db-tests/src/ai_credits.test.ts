/**
 * AI credits: lower allowances, the Ask MyHomeSeller limit, credit packs bought by GCash,
 * and spending credits. Nobody writes credits or uses from the app; only the server
 * spends credits, the soonest-expiring first, and never more than a business has.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-000000000ca1";
const AGENT = "00000000-0000-0000-0000-000000000ca2";
const OTHER = "00000000-0000-0000-0000-000000000cb1";
const ADMIN = "00000000-0000-0000-0000-000000000cee";

let db: PGlite;
let biz: string;
let other: string;

const payPack = async (pack: string, reference: string, business = biz) =>
  (
    await db.query<{ id: string }>(
      `insert into public.payments (business_id, pack_code, amount_minor, reference, payer_name, submitted_by)
       values ($1, $2, 14900, $3, 'Ken D.', $4) returning id`,
      [business, pack, reference, OWNER],
    )
  ).rows[0]!.id;
const balance = async (business = biz) => (await db.query<{ n: number }>(`select public.ai_credit_balance($1) as n`, [business])).rows[0]!.n;
const use = async (feature: string, credits: number, business = biz) =>
  (await db.query<{ n: number }>(`select public.record_ai_use($1, $2, $3) as n`, [business, feature, credits])).rows[0]!.n;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'co@example.test', '{}'), ('${AGENT}', 'ca@example.test', '{}'), ('${OTHER}', 'cx@example.test', '{}'), ('${ADMIN}', 'cs@example.test', '{}');
  `);
  await db.query(`update public.profiles set is_superadmin = true where id = $1`, [ADMIN]);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Credits Realty (test)') as id`)).rows[0]!.id);
  other = await as(db, OTHER, async () => (await db.query<{ id: string }>(`select public.create_business('Other Credits (test)') as id`)).rows[0]!.id);
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [biz, AGENT]);
});

describe("allowances", () => {
  it("are 3,000 / 6,000 / 15,000 AI replies and 150 / 400 / 1,000 Ask MyHomeSeller questions", async () => {
    const { rows } = await db.query<{ code: string; feature_key: string; limit: number | null }>(
      `select p.code, e.feature_key, e."limit" from public.plan_entitlements e join public.plans p on p.id = e.plan_id
       where p.is_active and e.feature_key in ('ai_replies', 'ai_assistant') order by p.sort_order, e.feature_key`,
    );
    expect(rows).toEqual([
      { code: "free", feature_key: "ai_assistant", limit: 0 },
      { code: "free", feature_key: "ai_replies", limit: 0 },
      { code: "basic", feature_key: "ai_assistant", limit: 150 },
      { code: "basic", feature_key: "ai_replies", limit: 3000 },
      { code: "pro", feature_key: "ai_assistant", limit: 400 },
      { code: "pro", feature_key: "ai_replies", limit: 6000 },
      { code: "agency", feature_key: "ai_assistant", limit: 1000 },
      { code: "agency", feature_key: "ai_replies", limit: 15000 },
    ]);
  });
});

describe("credit packs", () => {
  it("are 1,000 for ₱149, 3,000 for ₱399 and 10,000 for ₱1,199, each kept 12 months, and anyone signed in can see them", async () => {
    const { rows } = await as(db, AGENT, () =>
      db.query(`select code, credits, price_minor, valid_months from public.credit_packs where is_active order by sort_order`),
    );
    expect(rows).toEqual([
      { code: "credits_1000", credits: 1000, price_minor: 14900, valid_months: 12 },
      { code: "credits_3000", credits: 3000, price_minor: 39900, valid_months: 12 },
      { code: "credits_10000", credits: 10000, price_minor: 119900, valid_months: 12 },
    ]);
    await as(db, OWNER, () => db.query(`update public.credit_packs set price_minor = 100`));
    expect((await db.query<{ n: number }>(`select min(price_minor) as n from public.credit_packs`)).rows[0]!.n).toBe(14900);
  });

  it("are paid for like a plan: a payment buys a plan or a pack, never both or neither", async () => {
    const basic = (await db.query<{ id: string }>(`select id from public.plans where code = 'basic'`)).rows[0]!.id;
    await expect(
      db.query(`insert into public.payments (business_id, plan_id, pack_code, amount_minor, reference, payer_name) values ($1, $2, 'credits_1000', 14900, '2000000000009', 'x')`, [biz, basic]),
    ).rejects.toThrow(/payments_item_check/);
    await expect(db.query(`insert into public.payments (business_id, amount_minor, reference, payer_name) values ($1, 14900, '2000000000008', 'x')`, [biz])).rejects.toThrow(
      /payments_item_check/,
    );
    await expect(
      as(db, OWNER, () =>
        db.query(`insert into public.payments (business_id, pack_code, amount_minor, reference, payer_name) values ($1, 'credits_1000', 14900, '2000000000007', 'x')`, [biz]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("allow one pack payment waiting at a time, beside a plan payment", async () => {
    const basic = (await db.query<{ id: string }>(`select id from public.plans where code = 'basic'`)).rows[0]!.id;
    await db.query(`insert into public.payments (business_id, plan_id, amount_minor, reference, payer_name) values ($1, $2, 49900, '2000000000010', 'Ken D.')`, [biz, basic]);
    const first = await payPack("credits_1000", "2000000000011");
    await expect(payPack("credits_3000", "2000000000012")).rejects.toThrow(/payments_one_pending_pack/);
    await db.query(`delete from public.payments where id = $1 or reference = '2000000000010'`, [first]);
  });

  it("add credits for 12 months once a super admin confirms, and only then", async () => {
    const id = await payPack("credits_1000", "2000000000001");
    expect(await balance()).toBe(0);
    await expect(db.query(`select * from public.apply_payment($1, $2)`, [id, OWNER])).rejects.toThrow(/super admin/);
    await expect(as(db, ADMIN, () => db.query(`select * from public.apply_payment($1, $2)`, [id, ADMIN]))).rejects.toThrow(/permission denied/);
    await db.query(`select * from public.apply_payment($1, $2)`, [id, ADMIN]);
    expect(await balance()).toBe(1000);
    const lot = await db.query<{ months: number; status: string }>(
      `select extract(month from age(l.expires_at, l.created_at))::int + 12 * extract(year from age(l.expires_at, l.created_at))::int as months, p.status
       from public.ai_credit_lots l join public.payments p on p.id = l.payment_id where p.id = $1`,
      [id],
    );
    expect(lot.rows).toEqual([{ months: 12, status: "confirmed" }]);
    await expect(db.query(`select * from public.apply_payment($1, $2)`, [id, ADMIN])).rejects.toThrow(/not waiting for review/);
  });

  it("are visible to the business's owners and admins only", async () => {
    expect((await as(db, OWNER, () => db.query(`select id from public.ai_credit_lots`))).rows).toHaveLength(1);
    expect((await as(db, AGENT, () => db.query(`select id from public.ai_credit_lots`))).rows).toHaveLength(0);
    expect((await as(db, OTHER, () => db.query(`select id from public.ai_credit_lots`))).rows).toHaveLength(0);
    expect(await as(db, OTHER, () => balance(biz))).toBe(0);
    expect(await as(db, OWNER, () => balance(biz))).toBe(1000);
    await as(db, OWNER, () => db.query(`update public.ai_credit_lots set expires_at = now() + interval '9 years'`));
    expect((await db.query<{ n: number }>(`select count(*)::int as n from public.ai_credit_lots where expires_at > now() + interval '2 years'`)).rows[0]!.n).toBe(0);
    await expect(
      as(db, OWNER, () => db.query(`insert into public.ai_credit_lots (business_id, credits, remaining, expires_at) values ($1, 5, 5, now() + interval '1 year')`, [biz])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("spending credits", () => {
  it("is for the server only", async () => {
    await expect(as(db, OWNER, () => use("reply", 1))).rejects.toThrow(/permission denied/);
    await expect(as(db, OWNER, () => db.query(`insert into public.ai_uses (business_id, feature) values ($1, 'ask')`, [biz]))).rejects.toThrow(/row-level security/);
  });

  it("records uses on the plan's allowance without taking credits, for the whole team to see", async () => {
    expect(await use("ask", 0)).toBe(0);
    expect(await balance()).toBe(1000);
    expect((await as(db, OWNER, () => db.query(`select feature, credits from public.ai_uses`))).rows).toEqual([{ feature: "ask", credits: 0 }]);
    expect((await as(db, AGENT, () => db.query(`select id from public.ai_uses`))).rows).toHaveLength(1);
    expect((await as(db, OTHER, () => db.query(`select id from public.ai_uses`))).rows).toHaveLength(0);
  });

  it("takes the soonest-expiring credits first and skips expired ones", async () => {
    await db.query(
      `insert into public.ai_credit_lots (business_id, credits, remaining, expires_at, created_at) values
        ($1, 3, 3, now() + interval '1 month', now()),
        ($1, 50, 50, now() - interval '1 day', now() - interval '1 year')`,
      [biz],
    );
    expect(await balance()).toBe(1003);
    expect(await use("ask", 2)).toBe(2);
    expect(await use("reply", 1)).toBe(1);
    expect(await use("reply", 1)).toBe(1);
    const { rows } = await db.query<{ credits: number; remaining: number }>(
      `select credits, remaining from public.ai_credit_lots where business_id = $1 order by credits`,
      [biz],
    );
    expect(rows).toEqual([
      { credits: 3, remaining: 0 },
      { credits: 50, remaining: 50 },
      { credits: 1000, remaining: 999 },
    ]);
    expect(await balance()).toBe(999);
  });

  it("refuses when there aren't enough credits, and records nothing", async () => {
    expect(await balance(other)).toBe(0);
    expect(await use("reply", 1, other)).toBe(-1);
    expect((await db.query(`select id from public.ai_uses where business_id = $1`, [other])).rows).toHaveLength(0);
    await expect(use("chat", 1)).rejects.toThrow(/not a valid AI use/);
    await expect(use("reply", -1)).rejects.toThrow(/not a valid AI use/);
  });
});
