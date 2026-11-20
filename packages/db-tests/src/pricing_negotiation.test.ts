/**
 * AI chat language, the Pricing Advisor's monthly allowance, and AI negotiation:
 * the owner's private lowest price, offers recorded by the server, and the
 * owner's answer. Only the server records offers and price checks.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-00000000e0a1";
const AGENT = "00000000-0000-0000-0000-00000000e0a2";
const RIVAL = "00000000-0000-0000-0000-00000000e0b1";
const BUYER = "00000000-0000-0000-0000-00000000e0c1";

let db: PGlite;
let biz: string;
let rivalBiz: string;
let listing: string;
let conv: string;
let lead: string;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
     ('${OWNER}', 'owner@example.test', '{}'), ('${AGENT}', 'agent@example.test', '{}'), ('${RIVAL}', 'rival@example.test', '{}'), ('${BUYER}', 'buyer@example.test', '{}');`,
  );
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Deal Realty (test)') as id`)).rows[0]!.id);
  rivalBiz = await as(db, RIVAL, async () => (await db.query<{ id: string }>(`select public.create_business('Rival Realty (test)') as id`)).rows[0]!.id);
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [biz, AGENT]);
  listing = (
    await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, is_public, created_by)
       values ($1, 'Condo (test)', 'condominium', 'Pasig', 500000000, true, $2) returning id`,
      [biz, OWNER],
    )
  ).rows[0]!.id;
  // A chat with a lead behind it (an app chat is the simplest kind to set up here).
  conv = (
    await db.query<{ id: string }>(`insert into public.messenger_conversations (business_id, channel, buyer_id) values ($1, 'app', $2) returning id`, [biz, BUYER])
  ).rows[0]!.id;
  const linked = (await db.query<{ prospect_id: string | null }>(`select prospect_id from public.messenger_conversations where id = $1`, [conv])).rows[0]!.prospect_id;
  lead = linked ?? (await db.query<{ id: string }>(`insert into public.prospects (business_id, name, source) values ($1, 'Juan', 'app_chat') returning id`, [biz])).rows[0]!.id;
  if (!linked) await db.query(`update public.messenger_conversations set prospect_id = $2 where id = $1`, [conv, lead]);
});

describe("AI chat language", () => {
  it("is Taglish unless the business picks English, and nothing else", async () => {
    await db.query(`insert into public.agent_settings (business_id) values ($1)`, [biz]);
    expect((await db.query<{ chat_language: string }>(`select chat_language from public.agent_settings where business_id = $1`, [biz])).rows[0]!.chat_language).toBe("taglish");
    await db.query(`update public.agent_settings set chat_language = 'english' where business_id = $1`, [biz]);
    await expect(db.query(`update public.agent_settings set chat_language = 'cebuano' where business_id = $1`, [biz])).rejects.toThrow(/check/);
  });
});

describe("the owner's lowest price", () => {
  const setFloor = (minor: number, property = listing) =>
    db.query(
      `insert into public.listing_floors (property_id, business_id, min_price_minor) values ($1, $2, $3)
       on conflict (property_id) do update set min_price_minor = excluded.min_price_minor`,
      [property, biz, minor],
    );

  it("can be set by the owner, at or under the asking price", async () => {
    await as(db, OWNER, () => setFloor(450000000));
    const row = (await db.query<{ min_price_minor: string; updated_by: string; business_id: string }>(`select * from public.listing_floors where property_id = $1`, [listing])).rows[0]!;
    expect(Number(row.min_price_minor)).toBe(450000000);
    expect(row.updated_by).toBe(OWNER);
    await expect(as(db, OWNER, () => setFloor(600000000))).rejects.toThrow(/above the asking price/);
  });

  it("is hidden from agents and can't be set by them", async () => {
    expect((await as(db, AGENT, () => db.query(`select * from public.listing_floors`))).rows).toHaveLength(0);
    await expect(as(db, AGENT, () => setFloor(100000000))).rejects.toThrow(/row-level security/);
  });

  it("can't be filed by another business for this listing", async () => {
    // The rival names their own business; the row still takes the listing's business, which they don't run.
    await expect(
      as(db, RIVAL, () => db.query(`insert into public.listing_floors (property_id, business_id, min_price_minor) values ($1, $2, 1000)`, [listing, rivalBiz])),
    ).rejects.toThrow(/row-level security|duplicate key/);
    expect((await as(db, RIVAL, () => db.query(`select * from public.listing_floors`))).rows).toHaveLength(0);
    expect(Number((await db.query<{ min_price_minor: string }>(`select min_price_minor from public.listing_floors where property_id = $1`, [listing])).rows[0]!.min_price_minor)).toBe(450000000);
  });
});

describe("offers", () => {
  const record = (amount: number, counter: number | null, outcome: string) =>
    db.query<{ id: string | null }>(`select public.record_offer($1, $2, $3, $4, $5, 'Juan') as id`, [listing, conv, amount, counter, outcome]).then((r) => r.rows[0]!.id);
  const stage = async () => (await db.query<{ stage: string }>(`select stage from public.prospects where id = $1`, [lead])).rows[0]!.stage;
  let pending: string;

  it("can only be recorded by the server", async () => {
    await expect(as(db, OWNER, () => record(460000000, null, "pending"))).rejects.toThrow(/permission denied/);
    await expect(record(460000000, null, "confirmed")).rejects.toThrow(/invalid outcome/);
  });

  it("leave the lead where it is while the offer is too low or countered", async () => {
    expect(await record(300000000, 480000000, "too_low")).toBeTruthy();
    expect(await record(455000000, 480000000, "countered")).toBeTruthy();
    expect(await stage()).toBe("inquiry");
  });

  it("move the lead to Offer and log it once an offer is acceptable", async () => {
    pending = (await record(470000000, null, "pending"))!;
    expect(await stage()).toBe("offer");
    const ev = await db.query<{ body: string }>(`select body from public.prospect_events where prospect_id = $1 and kind = 'task' order by created_at desc limit 1`, [lead]);
    expect(ev.rows[0]!.body).toBe("Offered ₱4,700,000 for Condo (test). Waiting for the owner to confirm.");
  });

  it("aren't recorded for a listing that's no longer for sale", async () => {
    const sold = (
      await db.query<{ id: string }>(
        `insert into public.properties (business_id, name, type, location, price_minor, status, created_by)
         values ($1, 'Sold (test)', 'lot', 'Pasig', 100000000, 'sold', $2) returning id`,
        [biz, OWNER],
      )
    ).rows[0]!.id;
    expect((await db.query<{ id: string | null }>(`select public.record_offer($1, $2, 90000000, null, 'pending', 'Juan') as id`, [sold, conv])).rows[0]!.id).toBeNull();
  });

  it("are visible to the team, not to other businesses", async () => {
    expect((await as(db, AGENT, () => db.query(`select id from public.listing_offers`))).rows).toHaveLength(3);
    expect((await as(db, RIVAL, () => db.query(`select id from public.listing_offers`))).rows).toHaveLength(0);
    await expect(
      as(db, OWNER, () => db.query(`insert into public.listing_offers (business_id, property_id, amount_minor, outcome) values ($1, $2, 1, 'confirmed')`, [biz, listing])),
    ).rejects.toThrow(/row-level security/);
  });

  it("are confirmed or declined by an owner or admin only, once", async () => {
    const decide = (who: string, confirm: boolean) =>
      as(db, who, () => db.query<{ r: string }>(`select public.decide_offer($1, $2) as r`, [pending, confirm]).then((x) => x.rows[0]!.r));
    expect(await decide(AGENT, true)).toBe("denied");
    expect(await decide(RIVAL, true)).toBe("denied");
    expect(await decide(OWNER, true)).toBe("confirmed");
    expect(await decide(OWNER, false)).toBe("not_pending");
    const o = (await db.query<{ outcome: string; decided_by: string }>(`select outcome, decided_by from public.listing_offers where id = $1`, [pending])).rows[0]!;
    expect(o).toEqual({ outcome: "confirmed", decided_by: OWNER });
    const ev = await db.query<{ body: string }>(`select body from public.prospect_events where prospect_id = $1 and kind = 'task' order by created_at desc limit 1`, [lead]);
    expect(ev.rows[0]!.body).toBe("Offer of ₱4,700,000 for Condo (test) confirmed");
  });
});

describe("price checks", () => {
  const start = (user: string, limit: number | null) =>
    db.query<{ id: string | null }>(`select public.price_check_start($1, $2, $3, $4, '{"location":"Pasig"}'::jsonb) as id`, [biz, user, limit, listing]).then((r) => r.rows[0]!.id);

  it("can only be started by the server, for someone on the team", async () => {
    await expect(as(db, OWNER, () => start(OWNER, 20))).rejects.toThrow(/permission denied/);
    expect(await start(RIVAL, 20)).toBeNull();
  });

  it("stop at the month's allowance", async () => {
    expect(await start(OWNER, 2)).toBeTruthy();
    expect(await start(AGENT, 2)).toBeTruthy();
    expect(await start(OWNER, 2)).toBeNull();
    expect(await start(OWNER, 0)).toBeNull();
    expect(await start(OWNER, null)).toBeTruthy();
  });

  it("are readable by the team only", async () => {
    expect((await as(db, AGENT, () => db.query(`select id from public.price_checks`))).rows).toHaveLength(3);
    expect((await as(db, RIVAL, () => db.query(`select id from public.price_checks`))).rows).toHaveLength(0);
  });
});

describe("plans", () => {
  it("give negotiation to Pro and Agency, and 20 price checks to Agency", async () => {
    const rows = await db.query<{ code: string; feature_key: string; limit: number | null }>(
      `select p.code, e.feature_key, e."limit" from public.plan_entitlements e join public.plans p on p.id = e.plan_id
       where e.feature_key in ('ai_negotiation', 'ai_price_checks') order by p.code, e.feature_key`,
    );
    expect(rows.rows).toEqual([
      { code: "agency", feature_key: "ai_negotiation", limit: null },
      { code: "agency", feature_key: "ai_price_checks", limit: 20 },
      { code: "pro", feature_key: "ai_negotiation", limit: null },
    ]);
  });
});
