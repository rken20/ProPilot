/**
 * The app admin's Accounts screen: only a super admin, only from the server.
 * Restricting closes a person's access in the database itself, a restricted
 * person can't lift it, and deleting removes what is theirs and nothing else.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const ADMIN = "00000000-0000-0000-0000-0000000d0dee";
const OWNER = "00000000-0000-0000-0000-0000000d00a1";
const AGENT = "00000000-0000-0000-0000-0000000d00a2";
const PARTNER = "00000000-0000-0000-0000-0000000d00a3";
const SOLO = "00000000-0000-0000-0000-0000000d00b1";
const OTHER_ADMIN = "00000000-0000-0000-0000-0000000d0def";

let db: PGlite;
let biz: string;
let soloBiz: string;
let shared: string;
let listing: string;
let soloListing: string;

const business = (user: string, name: string) => as(db, user, async () => (await db.query<{ id: string }>(`select public.create_business($1) as id`, [name])).rows[0]!.id);
const addListing = async (b: string, by: string, name: string, isPublic = true) =>
  (
    await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public) values ($1, $2, 'house_and_lot', 'Pototan', 250000000, $3, $4) returning id`,
      [b, name, by, isPublic],
    )
  ).rows[0]!.id;
const restrict = (user: string, on: boolean, by = ADMIN) => db.query(`select public.admin_set_restricted($1, $2, $3)`, [user, on, by]);
const setPlan = (b: string, plan: string, until: string | null, by = ADMIN) => db.query<{ ends: string | null }>(`select public.admin_set_plan($1, $2, $3, $4)::text as ends`, [b, plan, until, by]).then((r) => r.rows[0]!.ends);
const planOf = (b: string) =>
  db.query<{ code: string; until: string }>(`select p.code, (s.current_period_end at time zone 'Asia/Manila')::date::text as until from public.subscriptions s join public.plans p on p.id = s.plan_id where s.business_id = $1`, [b]).then((r) => r.rows[0] ?? null);
const mine = (user: string, table: string) => as(db, user, () => db.query(`select 1 from public.${table}`)).then((r) => r.rows.length);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, last_sign_in_at, raw_user_meta_data) values
      ('${ADMIN}', 'admin@example.test', now(), '{"full_name":"App Admin"}'),
      ('${OTHER_ADMIN}', 'admin2@example.test', null, '{"full_name":"Second Admin"}'),
      ('${OWNER}', 'owner@example.test', now() - interval '2 days', '{"full_name":"Olivia Owner"}'),
      ('${AGENT}', 'agent@example.test', now() - interval '30 days', '{"full_name":"Andy Agent"}'),
      ('${PARTNER}', 'partner@example.test', null, '{"full_name":"Pat Partner"}'),
      ('${SOLO}', 'solo@example.test', null, '{"full_name":"Sam Solo"}');
  `);
  await db.query(`update public.profiles set is_superadmin = true where id in ($1, $2)`, [ADMIN, OTHER_ADMIN]);
  biz = await business(OWNER, "Owner Realty (test)");
  soloBiz = await business(SOLO, "Solo Homes (test)");
  shared = await business(OWNER, "Shared Brokers (test)");
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active'), ($3, $4, 'owner', 'active')`, [biz, AGENT, shared, PARTNER]);
  listing = await addListing(biz, OWNER, "House A (test)");
  soloListing = await addListing(soloBiz, SOLO, "House S (test)");
  await addListing(shared, OWNER, "House Shared (test)");
  await db.query(`update public.properties set assigned_agent_id = $1 where id = $2`, [OWNER, listing]);
});

describe("the admin functions", () => {
  it("run only on the server and only for a super admin", async () => {
    for (const sql of [
      `select public.admin_counts('${ADMIN}')`,
      `select * from public.admin_accounts('${ADMIN}')`,
      `select public.admin_set_plan('${biz}', 'agency', '${inDays(30)}', '${ADMIN}')`,
      `select public.admin_set_restricted('${SOLO}', true, '${ADMIN}')`,
      `select * from public.admin_account_businesses('${SOLO}', '${ADMIN}')`,
      `select public.admin_delete_account('${SOLO}', '${ADMIN}')`,
    ]) {
      await expect(as(db, ADMIN, () => db.query(sql))).rejects.toThrow(/permission denied/);
      await expect(db.query(sql.replaceAll(ADMIN, OWNER))).rejects.toThrow(/only a super admin/);
    }
    expect(await planOf(biz)).toBeNull();
  });
});

describe("the numbers and the list", () => {
  it("count people, businesses, plans and listings", async () => {
    await setPlan(soloBiz, "pro", inDays(30));
    const counts = (await db.query<{ c: Record<string, unknown> }>(`select public.admin_counts($1) as c`, [ADMIN])).rows[0]!.c;
    expect(counts).toEqual({ people: 6, new_people_7d: 6, signed_in_7d: 2, restricted: 0, businesses: 3, listings: 3, public_listings: 3, plans: { free: 2, pro: 1 } });
  });

  it("list each person with their businesses, plan and what deleting them would take", async () => {
    const rows = (await db.query<{ email: string; full_name: string; status: string; is_superadmin: boolean; businesses: Array<Record<string, unknown>> }>(`select * from public.admin_accounts($1)`, [ADMIN])).rows;
    expect(rows.map((r) => r.email).sort()).toEqual(["admin2@example.test", "admin@example.test", "agent@example.test", "owner@example.test", "partner@example.test", "solo@example.test"]);
    const owner = rows.find((r) => r.email === "owner@example.test")!;
    expect(owner.full_name).toBe("Olivia Owner");
    expect(owner.businesses.map((b) => [b.name, b.role, b.plan_code, b.listings, b.sole_owner])).toEqual([
      ["Owner Realty (test)", "owner", "free", 1, true],
      ["Shared Brokers (test)", "owner", "free", 1, false],
    ]);
    const solo = rows.find((r) => r.email === "solo@example.test")!;
    expect(solo.businesses[0]).toMatchObject({ plan_code: "pro", plan_name: "Pro", restricted: false, sole_owner: true });
    expect(rows.find((r) => r.email === "agent@example.test")!.businesses[0]).toMatchObject({ role: "agent", sole_owner: false });
  });

  it("search by email, name or business, and treat % as an ordinary character", async () => {
    const find = (q: string) => db.query<{ email: string }>(`select email from public.admin_accounts($1, $2) order by email`, [ADMIN, q]).then((r) => r.rows.map((x) => x.email));
    expect(await find("SOLO@")).toEqual(["solo@example.test"]);
    expect(await find("olivia")).toEqual(["owner@example.test"]);
    expect(await find("shared brokers")).toEqual(["owner@example.test", "partner@example.test"]);
    expect(await find("%")).toEqual([]);
  });
});

describe("changing a plan", () => {
  it("sets the plan until the end of the chosen day, and Free ends it", async () => {
    await setPlan(biz, "agency", inDays(45));
    expect(await planOf(biz)).toEqual({ code: "agency", until: inDays(45) });
    await setPlan(biz, "basic", inDays(10));
    expect(await planOf(biz)).toEqual({ code: "basic", until: inDays(10) });
    expect(await setPlan(biz, "free", null)).toBeNull();
    expect(await planOf(biz)).toBeNull();
    const log = await db.query<{ action: string; plan: string }>(`select action, metadata->>'plan' as plan from public.audit_logs where action = 'admin.plan.set' and business_id = $1 order by id`, [biz]);
    expect(log.rows.map((r) => r.plan)).toEqual(["agency", "basic", "free"]);
  });

  it("refuses a date in the past or too far ahead, an unknown plan and an unknown business", async () => {
    await expect(setPlan(biz, "pro", inDays(-1))).rejects.toThrow(/end date/);
    await expect(setPlan(biz, "pro", inDays(365 * 6))).rejects.toThrow(/end date/);
    await expect(setPlan(biz, "pro", null)).rejects.toThrow(/choose the date/);
    await expect(setPlan(biz, "platinum", inDays(30))).rejects.toThrow(/unknown plan/);
    await expect(setPlan(ADMIN, "pro", inDays(30))).rejects.toThrow(/business not found/);
    expect(await planOf(biz)).toBeNull();
  });
});

describe("restricting an account", () => {
  it("closes their business data in the database, and takes a business with no other owner off public pages", async () => {
    expect(await mine(SOLO, "properties")).toBe(1);
    await restrict(SOLO, true);
    expect(await mine(SOLO, "properties")).toBe(0);
    expect(await mine(SOLO, "businesses")).toBe(0);
    expect(await mine(SOLO, "business_members")).toBe(0);
    await expect(as(db, SOLO, () => db.query(`update public.properties set name = 'Mine again' where id = $1 returning id`, [soloListing]))).resolves.toMatchObject({ rows: [] });
    expect((await db.query<{ r: boolean }>(`select restricted_at is not null as r from public.businesses where id = $1`, [soloBiz])).rows[0]!.r).toBe(true);
    const counts = (await db.query<{ c: { restricted: number } }>(`select public.admin_counts($1) as c`, [ADMIN])).rows[0]!.c;
    expect(counts.restricted).toBe(1);
  });

  it("can't be lifted by the person, and they can't start another business", async () => {
    await as(db, SOLO, () => db.query(`update public.profiles set full_name = 'Still Sam' where id = $1`, [SOLO]));
    await expect(as(db, SOLO, () => db.query(`update public.profiles set status = 'active' where id = $1`, [SOLO]))).rejects.toThrow(/row-level security/);
    await expect(business(SOLO, "Second Try (test)")).rejects.toThrow(/restricted/);
    expect((await db.query<{ status: string }>(`select status from public.profiles where id = $1`, [SOLO])).rows[0]!.status).toBe("suspended");
  });

  it("leaves a business alone while another owner may still use the app, and its team keeps working", async () => {
    await restrict(OWNER, true);
    const flags = await db.query<{ name: string; r: boolean }>(`select name, restricted_at is not null as r from public.businesses where id in ($1, $2) order by name`, [biz, shared]);
    expect(flags.rows).toEqual([
      { name: "Owner Realty (test)", r: true },
      { name: "Shared Brokers (test)", r: false },
    ]);
    expect(await mine(PARTNER, "properties")).toBe(1);
    expect(await mine(AGENT, "properties")).toBe(1);
    // Someone on the team can rename the business but not lift the restriction.
    await db.query(`update public.business_members set role = 'admin' where business_id = $1 and user_id = $2`, [biz, AGENT]);
    await as(db, AGENT, () => db.query(`update public.businesses set name = 'Owner Realty 2 (test)' where id = $1`, [biz]));
    await expect(as(db, AGENT, () => db.query(`update public.businesses set restricted_at = null where id = $1`, [biz]))).rejects.toThrow(/only MyHomeSeller/);
  });

  it("is undone by lifting it", async () => {
    await restrict(OWNER, false);
    await restrict(SOLO, false);
    expect(await mine(SOLO, "properties")).toBe(1);
    expect((await db.query(`select 1 from public.businesses where restricted_at is not null`)).rows).toHaveLength(0);
    const log = await db.query<{ action: string }>(`select action from public.audit_logs where action like 'admin.account.%' order by id`);
    expect(log.rows.map((r) => r.action)).toEqual(["admin.account.restrict", "admin.account.restrict", "admin.account.unrestrict", "admin.account.unrestrict"]);
  });

  it("never applies to yourself or another super admin", async () => {
    await expect(restrict(ADMIN, true)).rejects.toThrow(/your own account/);
    await expect(restrict(OTHER_ADMIN, true)).rejects.toThrow(/super admin cannot be restricted/);
    await expect(restrict(biz, true)).rejects.toThrow(/account not found/);
  });
});

describe("deleting an account", () => {
  it("never applies to yourself or another super admin", async () => {
    await expect(db.query(`select public.admin_delete_account($1, $1)`, [ADMIN])).rejects.toThrow(/your own account/);
    await expect(db.query(`select public.admin_delete_account($1, $2)`, [OTHER_ADMIN, ADMIN])).rejects.toThrow(/super admin cannot be deleted/);
    await expect(db.query(`select public.admin_delete_account($1, $2)`, [biz, ADMIN])).rejects.toThrow(/account not found/);
  });

  it("says first which businesses go with the person", async () => {
    const rows = (await db.query<{ name: string; listings: number }>(`select name, listings::int from public.admin_account_businesses($1, $2)`, [OWNER, ADMIN])).rows;
    expect(rows).toEqual([{ name: "Owner Realty 2 (test)", listings: 1 }]);
    expect((await db.query(`select 1 from public.admin_account_businesses($1, $2)`, [AGENT, ADMIN])).rows).toHaveLength(0);
  });

  it("removes a team member without touching the business", async () => {
    await db.query(`insert into public.plan_grants (email, plan_id, months) values ('agent@example.test', (select id from public.plans where code = 'pro'), 3)`);
    const gone = (await db.query<{ ids: string[] }>(`select public.admin_delete_account($1, $2) as ids`, [AGENT, ADMIN])).rows[0]!.ids;
    expect(gone).toEqual([]);
    await db.query(`delete from auth.users where id = $1`, [AGENT]);
    expect((await db.query(`select 1 from public.profiles where id = $1`, [AGENT])).rows).toHaveLength(0);
    expect((await db.query(`select 1 from public.plan_grants where email = 'agent@example.test'`)).rows).toHaveLength(0);
    expect(await mine(OWNER, "properties")).toBe(2);
  });

  it("deletes the businesses only they own, hands the shared one to the other owner, and frees the sign-in to be removed", async () => {
    const gone = (await db.query<{ ids: string[] }>(`select public.admin_delete_account($1, $2) as ids`, [OWNER, ADMIN])).rows[0]!.ids;
    expect(gone).toEqual([biz]);
    expect((await db.query(`select 1 from public.businesses where id = $1`, [biz])).rows).toHaveLength(0);
    expect((await db.query(`select 1 from public.properties where id = $1`, [listing])).rows).toHaveLength(0);
    // The shared business stays, now in the partner's name.
    const kept = await db.query<{ created_by: string; listing_by: string }>(
      `select b.created_by, p.created_by as listing_by from public.businesses b join public.properties p on p.business_id = b.id where b.id = $1`,
      [shared],
    );
    expect(kept.rows).toEqual([{ created_by: PARTNER, listing_by: PARTNER }]);
    expect(await mine(PARTNER, "properties")).toBe(1);
    // Nothing in the app's tables still stops the sign-in from being deleted.
    await db.query(`delete from auth.users where id = $1`, [OWNER]);
    expect((await db.query(`select 1 from public.profiles where id = $1`, [OWNER])).rows).toHaveLength(0);
    // Outside that one deletion an owner still can't be removed, by the server or by anyone signed in.
    await expect(db.query(`delete from public.business_members where user_id = $1`, [PARTNER])).rejects.toThrow(/owner cannot be removed/);
    await expect(as(db, PARTNER, () => db.query(`select set_config('app.admin_delete', '1', false)`).then(() => db.query(`delete from public.business_members where user_id = $1`, [PARTNER])))).rejects.toThrow(/owner cannot be removed/);
    await db.query(`select set_config('app.admin_delete', '', false)`);
    // Other people's businesses are untouched.
    expect(await mine(SOLO, "properties")).toBe(1);
    const log = await db.query<{ n: string }>(`select metadata->>'businesses_deleted' as n from public.audit_logs where action = 'admin.account.delete' order by id`);
    expect(log.rows.map((r) => r.n)).toEqual(["0", "1"]);
  });
});
