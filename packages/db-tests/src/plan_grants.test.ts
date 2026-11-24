/**
 * Plans given to beta testers by email: only a super admin gives them, only the
 * server runs it, and a grant is used once, by the account with that confirmed
 * email, when it owns a business.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const ADMIN = "00000000-0000-0000-0000-0000000c0dee";
const OWNER = "00000000-0000-0000-0000-0000000c00a1";
const AGENT = "00000000-0000-0000-0000-0000000c00a2";
const LATER = "00000000-0000-0000-0000-0000000c00b1";
const SQUAT = "00000000-0000-0000-0000-0000000c00c1";
const TWO = "00000000-0000-0000-0000-0000000c00d1";

let db: PGlite;
let biz: string;

type Result = { status: string; business_id: string | null; business_name: string | null; period_end: string | null };
const give = (email: string, plan = "pro", months = 3, by = ADMIN, note: string | null = null) =>
  db.query<Result>(`select status, business_id, business_name, period_end::text from public.grant_plan_by_email($1, $2, $3, $4, $5)`, [email, plan, months, note, by]).then((r) => r.rows[0]!);
const planOf = (business: string) =>
  db
    .query<{ code: string; months: number }>(
      `select p.code, round(extract(epoch from (s.current_period_end - now())) / 86400 / 30)::int as months
       from public.subscriptions s join public.plans p on p.id = s.plan_id where s.business_id = $1`,
      [business],
    )
    .then((r) => r.rows[0] ?? null);
const grants = (email: string) =>
  db.query<{ claimed: boolean; cancelled: boolean; months: number; code: string }>(
    `select g.claimed_at is not null as claimed, g.cancelled_at is not null as cancelled, g.months, p.code
     from public.plan_grants g join public.plans p on p.id = g.plan_id where g.email = $1 order by g.created_at`,
    [email],
  ).then((r) => r.rows);
const business = (user: string, name: string) => as(db, user, async () => (await db.query<{ id: string }>(`select public.create_business($1) as id`, [name])).rows[0]!.id);

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ADMIN}', 'admin@example.test', '{}'), ('${OWNER}', 'Owner@Example.test', '{}'), ('${AGENT}', 'agent@example.test', '{}'),
      ('${LATER}', 'later@example.test', '{}'), ('${TWO}', 'two@example.test', '{}');
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ('${SQUAT}', 'tester@example.test', null, '{}');
  `);
  await db.query(`update public.profiles set is_superadmin = true where id = $1`, [ADMIN]);
  biz = await business(OWNER, "Grant Realty (test)");
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [biz, AGENT]);
});

describe("giving a plan by email", () => {
  it("is for the server and a super admin only", async () => {
    await expect(as(db, ADMIN, () => give("owner@example.test"))).rejects.toThrow(/permission denied/);
    await expect(as(db, OWNER, () => db.query(`select public.claim_plan_grants()`))).rejects.toThrow(/permission denied/);
    await expect(as(db, OWNER, () => db.query(`select public.grant_plan_to_business($1, 'agency', 12, $2)`, [biz, ADMIN]))).rejects.toThrow(/permission denied/);
    await expect(as(db, OWNER, () => db.query(`select * from public.plan_grant_apply($1, (select id from public.plans where code = 'agency'), 12, $2)`, [biz, OWNER]))).rejects.toThrow(/permission denied/);
    await expect(give("owner@example.test", "pro", 3, OWNER)).rejects.toThrow(/only a super admin/);
    await expect(db.query(`select public.grant_plan_to_business($1, 'pro', 3, $2)`, [biz, OWNER])).rejects.toThrow(/only a super admin/);
    expect(await planOf(biz)).toBeNull();
  });

  it("refuses a bad email, the Free plan, an unknown plan and a wrong number of months", async () => {
    await expect(give("not-an-email")).rejects.toThrow(/check/);
    await expect(give("a b@example.test")).rejects.toThrow(/check/);
    await expect(give("owner@example.test", "free")).rejects.toThrow(/unknown plan/);
    await expect(give("owner@example.test", "platinum")).rejects.toThrow(/unknown plan/);
    await expect(give("owner@example.test", "pro", 0)).rejects.toThrow(/months/);
    await expect(give("owner@example.test", "pro", 13)).rejects.toThrow(/months/);
    expect((await db.query(`select 1 from public.plan_grants`)).rows).toHaveLength(0);
  });

  it("turns the plan on at once for an account that owns a business, however the email is typed", async () => {
    const res = await give("  OWNER@example.TEST ", "pro", 3, ADMIN, "Beta tester");
    expect(res.status).toBe("applied");
    expect(res.business_id).toBe(biz);
    expect(res.business_name).toBe("Grant Realty (test)");
    expect(await planOf(biz)).toEqual({ code: "pro", months: 3 });
    expect(await grants("owner@example.test")).toEqual([{ claimed: true, cancelled: false, months: 3, code: "pro" }]);
    // It shows in the business's payment history as a free plan that was given.
    const pays = await as(db, OWNER, () => db.query<{ method: string; status: string; amount_minor: number; months: number }>(`select method, status, amount_minor, months from public.payments where business_id = $1`, [biz]));
    expect(pays.rows).toEqual([{ method: "complimentary", status: "confirmed", amount_minor: 0, months: 3 }]);
  });

  it("adds on to the end when the same plan is given again, and still works while a GCash payment is being checked", async () => {
    await db.query(
      `insert into public.payments (business_id, plan_id, months, amount_minor, reference, payer_name, submitted_by)
       values ($1, (select id from public.plans where code = 'basic'), 1, 49900, '1234567890123', 'Ken D.', $2)`,
      [biz, OWNER],
    );
    expect((await give("owner@example.test", "pro", 1)).status).toBe("applied");
    expect(await planOf(biz)).toEqual({ code: "pro", months: 4 });
    await db.query(`select public.grant_plan_to_business($1, 'agency', 12, $2)`, [biz, ADMIN]);
    expect(await planOf(biz)).toEqual({ code: "agency", months: 12 });
  });

  it("waits for an account with no business of its own, and for an email nobody has signed up with", async () => {
    // An agent in someone else's business doesn't get that business a plan.
    expect((await give("agent@example.test", "basic", 6)).status).toBe("waiting_business");
    expect((await give("later@example.test", "pro", 3)).status).toBe("waiting_business");
    expect((await give("newcomer@example.test", "pro", 3)).status).toBe("waiting_signup");
    expect(await grants("agent@example.test")).toEqual([{ claimed: false, cancelled: false, months: 6, code: "basic" }]);
  });

  it("replaces a waiting grant when the same email is given again", async () => {
    expect((await give("later@example.test", "agency", 12)).status).toBe("waiting_business");
    expect(await grants("later@example.test")).toEqual([{ claimed: false, cancelled: false, months: 12, code: "agency" }]);
  });

  it("turns on when that person sets up their business, once", async () => {
    const laterBiz = await business(LATER, "Later Homes (test)");
    expect(await planOf(laterBiz)).toBeNull();
    expect((await db.query<{ n: number }>(`select public.claim_plan_grants($1) as n`, [LATER])).rows[0]!.n).toBe(1);
    expect(await planOf(laterBiz)).toEqual({ code: "agency", months: 12 });
    // Running it again, for them or for everyone, gives nothing more.
    expect((await db.query<{ n: number }>(`select public.claim_plan_grants($1) as n`, [LATER])).rows[0]!.n).toBe(0);
    expect((await db.query<{ n: number }>(`select public.claim_plan_grants() as n`)).rows[0]!.n).toBe(0);
    expect((await db.query(`select 1 from public.payments where business_id = $1`, [laterBiz])).rows).toHaveLength(1);
    // The agent's grant is still waiting: they own no business.
    expect((await grants("agent@example.test"))[0]!.claimed).toBe(false);
  });

  it("is used on the first business when the account owns more than one", async () => {
    const first = await business(TWO, "First (test)");
    const second = await business(TWO, "Second (test)");
    const res = await give("two@example.test", "basic", 1);
    expect(res.business_id).toBe(first);
    expect(await planOf(second)).toBeNull();
  });

  it("is not used by an account that hasn't confirmed the email", async () => {
    expect((await give("tester@example.test", "pro", 3)).status).toBe("waiting_signup");
    const squatBiz = await business(SQUAT, "Squatter (test)");
    expect((await db.query<{ n: number }>(`select public.claim_plan_grants() as n`)).rows[0]!.n).toBe(0);
    expect(await planOf(squatBiz)).toBeNull();
    // Once the address is confirmed, the sweep for everyone picks it up.
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [SQUAT]);
    expect((await db.query<{ n: number }>(`select public.claim_plan_grants() as n`)).rows[0]!.n).toBe(1);
    expect(await planOf(squatBiz)).toEqual({ code: "pro", months: 3 });
  });

  it("is not used once it has been cancelled", async () => {
    await db.query(`update public.plan_grants set cancelled_at = now() where email = 'agent@example.test' and claimed_at is null`);
    const own = await business(AGENT, "Agent's Own (test)");
    expect((await db.query<{ n: number }>(`select public.claim_plan_grants() as n`)).rows[0]!.n).toBe(0);
    expect(await planOf(own)).toBeNull();
  });

  it("can be read by a super admin only, and written by nobody signed in", async () => {
    expect((await as(db, OWNER, () => db.query(`select 1 from public.plan_grants`))).rows).toHaveLength(0);
    expect((await as(db, ADMIN, () => db.query(`select 1 from public.plan_grants`))).rows.length).toBeGreaterThan(4);
    const pro = `(select id from public.plans where code = 'pro')`;
    await expect(as(db, OWNER, () => db.query(`insert into public.plan_grants (email, plan_id, months) values ('me@example.test', ${pro}, 12)`))).rejects.toThrow(/row-level security/);
    await expect(as(db, ADMIN, () => db.query(`insert into public.plan_grants (email, plan_id, months) values ('me@example.test', ${pro}, 12)`))).rejects.toThrow(/row-level security/);
    await as(db, ADMIN, () => db.query(`update public.plan_grants set months = 12`));
    await as(db, ADMIN, () => db.query(`delete from public.plan_grants`));
    expect((await db.query<{ n: number }>(`select count(*)::int as n from public.plan_grants where months = 12 and email <> 'later@example.test'`)).rows[0]!.n).toBe(0);
    expect((await db.query(`select 1 from public.plan_grants`)).rows.length).toBeGreaterThan(4);
  });
});
