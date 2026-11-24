/**
 * The AI chat closing a deal at a price the owner pre-approved: the private
 * "accept right away" price, the server-only 'accepted' outcome, and never two
 * agreed deals on one listing.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-00000000f0a1";
const AGENT = "00000000-0000-0000-0000-00000000f0a2";
const BUYER_A = "00000000-0000-0000-0000-00000000f0c1";
const BUYER_B = "00000000-0000-0000-0000-00000000f0c2";

let db: PGlite;
let biz: string;
let listing: string;
let convA: string;
let convB: string;

const newConv = async (buyer: string) => (await db.query<{ id: string }>(`insert into public.messenger_conversations (business_id, channel, buyer_id) values ($1, 'app', $2) returning id`, [biz, buyer])).rows[0]!.id;
const setFloor = (min: number, accept: number | null) =>
  db.query(
    `insert into public.listing_floors (property_id, business_id, min_price_minor, accept_price_minor) values ($1, $2, $3, $4)
     on conflict (property_id) do update set min_price_minor = excluded.min_price_minor, accept_price_minor = excluded.accept_price_minor`,
    [listing, biz, min, accept],
  );
let refs = 0;
const record = (conv: string, amount: number, outcome: string, ref: string | null = outcome === "accepted" ? `REF${String(++refs).padStart(5, "0")}` : null) =>
  db.query<{ id: string | null }>(`select public.record_offer($1, $2, $3, null, $4, 'Ana', $5) as id`, [listing, conv, amount, outcome, ref]).then((r) => r.rows[0]!.id);

beforeAll(async () => {
  db = await freshDb();
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
     ('${OWNER}', 'owner@example.test', '{}'), ('${AGENT}', 'agent@example.test', '{}'), ('${BUYER_A}', 'a@example.test', '{}'), ('${BUYER_B}', 'b@example.test', '{}');`,
  );
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Close Realty (test)') as id`)).rows[0]!.id);
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [biz, AGENT]);
  listing = (
    await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, is_public, created_by)
       values ($1, 'House (test)', 'house_and_lot', 'Pototan', 300000000, true, $2) returning id`,
      [biz, OWNER],
    )
  ).rows[0]!.id;
  convA = await newConv(BUYER_A);
  convB = await newConv(BUYER_B);
});

describe("the pre-approved price", () => {
  it("is set by the owner between the lowest price and the asking price", async () => {
    await as(db, OWNER, () => setFloor(250000000, 280000000));
    const row = (await db.query<{ accept_price_minor: string }>(`select accept_price_minor from public.listing_floors where property_id = $1`, [listing])).rows[0]!;
    expect(Number(row.accept_price_minor)).toBe(280000000);
    await expect(as(db, OWNER, () => setFloor(250000000, 240000000))).rejects.toThrow(/between the lowest price and the asking price/);
    await expect(as(db, OWNER, () => setFloor(250000000, 310000000))).rejects.toThrow(/between the lowest price and the asking price/);
  });

  it("stays hidden from agents, like the lowest price", async () => {
    expect((await as(db, AGENT, () => db.query(`select * from public.listing_floors`))).rows).toHaveLength(0);
    await expect(as(db, AGENT, () => setFloor(100000000, 200000000))).rejects.toThrow(/row-level security/);
  });
});

describe("a deal the AI agrees", () => {
  it("can only be recorded by the server, and only at or above the pre-approved price", async () => {
    await expect(as(db, OWNER, () => record(convA, 290000000, "accepted"))).rejects.toThrow(/permission denied/);
    await expect(record(convA, 270000000, "accepted")).rejects.toThrow(/not_pre_approved/);
  });

  it("is recorded as agreed, and moves the lead to Offer with a note about the reservation", async () => {
    const id = (await record(convA, 285000000, "accepted", "HSE2B7KQ"))!;
    const o = (await db.query<{ outcome: string; decided_at: string | null; prospect_id: string | null; deal_ref: string }>(`select outcome, decided_at, prospect_id, deal_ref from public.listing_offers where id = $1`, [id])).rows[0]!;
    expect(o.outcome).toBe("accepted");
    expect(o.deal_ref).toBe("HSE2B7KQ");
    expect(o.decided_at).not.toBeNull();
    if (o.prospect_id) {
      const stage = (await db.query<{ stage: string }>(`select stage from public.prospects where id = $1`, [o.prospect_id])).rows[0]!.stage;
      expect(stage).toBe("offer");
      const ev = await db.query<{ body: string }>(`select body from public.prospect_events where prospect_id = $1 and kind = 'task' order by created_at desc limit 1`, [o.prospect_id]);
      expect(ev.rows[0]!.body).toBe("Deal agreed by the AI: ₱2,850,000 for House (test) (ref. HSE2B7KQ), at or above the owner's pre-approved price. Next: the reservation.");
    }
  });

  it("can't be agreed twice on one listing, by the AI or by the owner", async () => {
    await expect(record(convB, 300000000, "accepted")).rejects.toThrow(/deal_taken/);
    // Another buyer's offer can still wait for the owner, but the owner can't confirm a second deal.
    const pending = (await record(convB, 260000000, "pending"))!;
    const r = await as(db, OWNER, () => db.query<{ r: string }>(`select public.decide_offer($1, true) as r`, [pending]).then((x) => x.rows[0]!.r));
    expect(r).toBe("deal_taken");
    expect((await db.query<{ outcome: string }>(`select outcome from public.listing_offers where id = $1`, [pending])).rows[0]!.outcome).toBe("pending");
    // Declining it still works.
    expect(await as(db, OWNER, () => db.query<{ r: string }>(`select public.decide_offer($1, false) as r`, [pending]).then((x) => x.rows[0]!.r))).toBe("declined");
  });

  it("can't be agreed without a pre-approved price", async () => {
    const other = (
      await db.query<{ id: string }>(
        `insert into public.properties (business_id, name, type, location, price_minor, is_public, created_by)
         values ($1, 'Lot (test)', 'lot', 'Pototan', 100000000, true, $2) returning id`,
        [biz, OWNER],
      )
    ).rows[0]!.id;
    await as(db, OWNER, () => db.query(`insert into public.listing_floors (property_id, business_id, min_price_minor) values ($1, $2, 90000000)`, [other, biz]));
    await expect(db.query(`select public.record_offer($1, $2, 100000000, null, 'accepted', null, 'ABCD2345')`, [other, convA])).rejects.toThrow(/not_pre_approved/);
  });

  it("needs a well-formed reference, used once", async () => {
    await expect(record(convA, 300000000, "accepted", null)).rejects.toThrow(/needs its reference/);
    await expect(db.query(`update public.listing_offers set deal_ref = 'bad ref!' where outcome = 'accepted'`)).rejects.toThrow(/check/);
  });
});
