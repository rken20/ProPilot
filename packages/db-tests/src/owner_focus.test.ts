/**
 * Owners and agents focus: inquiries from public listing pages (no buyer account),
 * page views, anonymous rate limits and Buyer Finder's monthly limit. Only the
 * server can call the new functions; the business reads its own rows.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-00000000f0a1";
const AGENT = "00000000-0000-0000-0000-00000000f0a2";
const OUTSIDER = "00000000-0000-0000-0000-00000000f0b1";

let db: PGlite;
let biz: string;
let listing: string;
let hidden: string;

const newListing = async (isPublic: boolean) =>
  (
    await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, is_public, created_by)
       values ($1, 'House (test)', 'house_and_lot', 'Pasig', 800000000, $2, $3) returning id`,
      [biz, isPublic, OWNER],
    )
  ).rows[0]!.id;

const inquire = (property: string, name: string, phone: string) =>
  db.query<{ id: string; prospect_id: string; channel: string; business_id: string }>(
    `insert into public.viewing_requests (business_id, property_id, buyer_name, buyer_phone, message)
     values ('00000000-0000-0000-0000-000000000000', $1, $2, $3, 'Is it still available?')
     returning id, prospect_id, channel, business_id`,
    [property, name, phone],
  );

beforeAll(async () => {
  db = await freshDb();
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
     ('${OWNER}', 'owner@example.test', '{}'), ('${AGENT}', 'agent@example.test', '{}'), ('${OUTSIDER}', 'out@example.test', '{}');`,
  );
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Focus Realty (test)') as id`)).rows[0]!.id);
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [biz, AGENT]);
  listing = await newListing(true);
  hidden = await newListing(false);
});

describe("public inquiries", () => {
  it("become a viewing request and a lead, with the business taken from the listing", async () => {
    const r = (await inquire(listing, "Maria Santos", "0917 123 4567")).rows[0]!;
    expect(r.business_id).toBe(biz);
    expect(r.channel).toBe("listing_page");
    expect(r.prospect_id).toBeTruthy();
    const ev = await db.query<{ body: string }>(`select body from public.prospect_events where prospect_id = $1 order by created_at`, [r.prospect_id]);
    expect(ev.rows.map((e) => e.body)).toEqual(["New lead from a listing inquiry", "Sent an inquiry about House (test) from its public page"]);
  });

  it("allow one open inquiry per phone number per listing", async () => {
    await expect(inquire(listing, "Maria Santos", "+63 917-123-4567".replace("+63 ", "0"))).rejects.toThrow(/already have an open request/);
  });

  it("join the open lead with the same phone on another listing", async () => {
    const other = await newListing(true);
    const first = await db.query<{ prospect_id: string }>(`select prospect_id from public.viewing_requests where property_id = $1`, [listing]);
    const r = (await inquire(other, "Maria S.", "09171234567")).rows[0]!;
    expect(r.prospect_id).toBe(first.rows[0]!.prospect_id);
  });

  it("aren't accepted for a hidden listing", async () => {
    await expect(inquire(hidden, "Juan", "09170000000")).rejects.toThrow(/not available/);
  });

  it("can't be sent by a signed-in user without their own account on it", async () => {
    await expect(as(db, OUTSIDER, () => inquire(listing, "Juan", "09175550000"))).rejects.toThrow(/row-level security/);
  });
});

describe("listing views", () => {
  it("are counted by the server and readable by the business only", async () => {
    await db.query(`select public.record_listing_view($1)`, [listing]);
    await db.query(`select public.record_listing_view($1)`, [listing]);
    await db.query(`select public.record_listing_view($1)`, [hidden]);
    const own = await as(db, AGENT, () => db.query<{ views: number }>(`select views from public.listing_views`));
    expect(own.rows).toEqual([{ views: 2 }]);
    const other = await as(db, OUTSIDER, () => db.query(`select views from public.listing_views`));
    expect(other.rows).toHaveLength(0);
    await expect(as(db, OWNER, () => db.query(`select public.record_listing_view($1)`, [listing]))).rejects.toThrow(/permission denied/);
  });
});

describe("anonymous rate limits", () => {
  it("count per key and window", async () => {
    const hit = async () => (await db.query<{ ok: boolean }>(`select public.consume_anon_rate_limit('ip:abc', 2, 3600) as ok`)).rows[0]!.ok;
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, false]);
  });
});

describe("Buyer Finder", () => {
  const add = (prospect: string, user: string, limit: number | null, property = listing) =>
    db.query<{ r: string }>(`select public.buyer_finder_add($1, $2, $3, $4, 80) as r`, [property, prospect, user, limit]).then((x) => x.rows[0]!.r);
  const lead = async (name: string) =>
    (await db.query<{ id: string }>(`insert into public.prospects (business_id, name) values ($1, $2) returning id`, [biz, name])).rows[0]!.id;

  it("can't be called by a signed-in user", async () => {
    const p = await lead("Ana");
    await expect(as(db, OWNER, () => add(p, OWNER, null))).rejects.toThrow(/permission denied/);
  });

  it("adds a lead once, from a member, and logs it on the lead", async () => {
    const p = await lead("Ben");
    expect(await add(p, OUTSIDER, null)).toBe("denied");
    expect(await add(p, AGENT, null)).toBe("added");
    expect(await add(p, OWNER, null)).toBe("already");
    const ev = await db.query<{ body: string }>(`select body from public.prospect_events where prospect_id = $1 and kind = 'task'`, [p]);
    expect(ev.rows[0]!.body).toBe("Buyer Finder: a potential buyer for House (test)");
  });

  it("stops at the monthly limit and skips closed leads", async () => {
    const results = [];
    for (const n of ["C", "D", "E", "F", "G"]) results.push(await add(await lead(n), OWNER, 5));
    // One was added above, so a limit of 5 leaves four.
    expect(results).toEqual(["added", "added", "added", "added", "limit"]);
    const won = await lead("Won lead");
    await db.query(`update public.prospects set stage = 'won' where id = $1`, [won]);
    expect(await add(won, OWNER, null)).toBe("not_open");
  });

  it("is visible to owners and agents of the business only", async () => {
    const own = await as(db, AGENT, () => db.query(`select id from public.listing_matches`));
    expect(own.rows.length).toBe(5);
    const other = await as(db, OUTSIDER, () => db.query(`select id from public.listing_matches`));
    expect(other.rows).toHaveLength(0);
    await expect(
      as(db, OWNER, () =>
        db.query(`insert into public.listing_matches (business_id, property_id, prospect_id) select $1, $2, id from public.prospects limit 1`, [biz, hidden]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
