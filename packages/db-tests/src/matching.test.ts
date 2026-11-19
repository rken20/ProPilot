/**
 * Buyer Finder: only the server can send a listing to a buyer, only to buyers who
 * opted in, at most the plan's monthly limit; buyers see and dismiss their own,
 * and nobody in the business can read who they were sent to.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-000000000ea1";
const AGENT = "00000000-0000-0000-0000-000000000ea2";
const OUTSIDER = "00000000-0000-0000-0000-000000000eb1";
const OPEN_BUYER = "00000000-0000-0000-0000-000000000ec1";
const CLOSED_BUYER = "00000000-0000-0000-0000-000000000ec2";
const FREE_BUYER = "00000000-0000-0000-0000-000000000ec3";
const BUYERS = Array.from({ length: 6 }, (_, i) => `00000000-0000-0000-0000-000000000ed${i}`);

let db: PGlite;
let biz: string;
let listing: string;
let hidden: string;

const listingFor = async (isPublic: boolean) =>
  (
    await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, is_public, created_by)
       values ($1, 'House (test)', 'house_and_lot', 'Pasig', 800000000, $2, $3) returning id`,
      [biz, isPublic, OWNER],
    )
  ).rows[0]!.id;
const introduce = (property: string, buyer: string, user: string, limit: number | null) =>
  db.query<{ r: string }>(`select public.buyer_finder_introduce($1, $2, $3, $4, 90) as r`, [property, buyer, user, limit]).then((x) => x.rows[0]!.r);

beforeAll(async () => {
  db = await freshDb();
  const users = [OWNER, AGENT, OUTSIDER, OPEN_BUYER, CLOSED_BUYER, FREE_BUYER, ...BUYERS];
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ${users.map((u, i) => `('${u}', 'u${i}@example.test', '{}')`).join(", ")};`);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Match Realty (test)') as id`)).rows[0]!.id);
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [biz, AGENT]);
  for (const b of [OPEN_BUYER, ...BUYERS]) {
    await as(db, b, () => db.query(`insert into public.buyer_preferences (user_id, areas, open_to_agents) values ($1, '{Pasig}', true)`, [b]));
  }
  await as(db, FREE_BUYER, () => db.query(`insert into public.buyer_preferences (user_id, areas, open_to_agents) values ($1, '{Pasig}', true)`, [FREE_BUYER]));
  // Everyone but FREE_BUYER is on Basic.
  await db.query(
    `insert into public.buyer_subscriptions (user_id, plan_id, current_period_start, current_period_end)
     select u, (select id from public.plans where code = 'basic'), now() - interval '1 day', now() + interval '1 month'
     from unnest($1::uuid[]) as u`,
    [[OPEN_BUYER, CLOSED_BUYER, ...BUYERS]],
  );
  await as(db, CLOSED_BUYER, () => db.query(`insert into public.buyer_preferences (user_id, areas) values ($1, '{Pasig}')`, [CLOSED_BUYER]));
  listing = await listingFor(true);
  hidden = await listingFor(false);
});

describe("opting in", () => {
  it("is off by default", async () => {
    const r = await db.query<{ open_to_agents: boolean; match_alerts: boolean }>(
      `select open_to_agents, match_alerts from public.buyer_preferences where user_id = $1`,
      [CLOSED_BUYER],
    );
    expect(r.rows[0]).toEqual({ open_to_agents: false, match_alerts: false });
  });
});

describe("buyer_finder_introduce", () => {
  it("can't be called by a signed-in user, even the owner", async () => {
    await expect(as(db, OWNER, () => introduce(listing, OPEN_BUYER, OWNER, null))).rejects.toThrow(/permission denied/);
  });

  it("sends only public listings, from a member, to buyers who opted in", async () => {
    expect(await introduce(hidden, OPEN_BUYER, OWNER, null)).toBe("not_public");
    expect(await introduce(listing, OPEN_BUYER, OUTSIDER, null)).toBe("denied");
    expect(await introduce(listing, CLOSED_BUYER, OWNER, null)).toBe("not_open");
    expect(await introduce(listing, FREE_BUYER, OWNER, null)).toBe("not_basic");
    expect(await introduce(listing, OPEN_BUYER, AGENT, null)).toBe("sent");
    expect(await introduce(listing, OPEN_BUYER, OWNER, null)).toBe("already");
  });

  it("stops at the monthly limit", async () => {
    // One already sent above; a limit of 5 allows four more.
    const results = [];
    for (const b of BUYERS) results.push(await introduce(listing, b, OWNER, 5));
    expect(results).toEqual(["sent", "sent", "sent", "sent", "limit", "limit"]);
    expect(await introduce(listing, BUYERS[5]!, OWNER, null)).toBe("sent");
    expect(await introduce(hidden, BUYERS[0]!, OWNER, 0)).toBe("not_public");
  });
});

describe("who sees introductions", () => {
  it("the buyer sees their own; the business and other buyers see none", async () => {
    const own = await as(db, OPEN_BUYER, () => db.query(`select id from public.buyer_introductions`));
    expect(own.rows).toHaveLength(1);
    for (const u of [OWNER, AGENT, CLOSED_BUYER]) {
      const r = await as(db, u, () => db.query(`select id from public.buyer_introductions`));
      expect(r.rows).toHaveLength(0);
    }
  });

  it("nobody can add one from the app", async () => {
    await expect(
      as(db, OWNER, () =>
        db.query(`insert into public.buyer_introductions (business_id, property_id, buyer_id) values ($1, $2, $3)`, [biz, listing, CLOSED_BUYER]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("a buyer can dismiss one but not change anything else", async () => {
    await as(db, OPEN_BUYER, () =>
      db.query(`update public.buyer_introductions set dismissed_at = now(), score = 1, property_id = $1, buyer_id = $2`, [hidden, CLOSED_BUYER]),
    );
    const r = await db.query<{ dismissed: boolean; score: number; property_id: string; buyer_id: string }>(
      `select dismissed_at is not null as dismissed, score, property_id, buyer_id from public.buyer_introductions where buyer_id = $1`,
      [OPEN_BUYER],
    );
    expect(r.rows).toEqual([{ dismissed: true, score: 90, property_id: listing, buyer_id: OPEN_BUYER }]);
  });
});
