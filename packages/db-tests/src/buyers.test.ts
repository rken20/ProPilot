/**
 * Buyer-side rules: account type, which listings buyers can see, favorites,
 * and viewing requests flowing to the right business only.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const AGENT_A = "00000000-0000-0000-0000-0000000000a1"; // owner of Business A
const AGENT_B = "00000000-0000-0000-0000-0000000000b1"; // owner of Business B
const BUYER = "00000000-0000-0000-0000-0000000000f1";
const BUYER2 = "00000000-0000-0000-0000-0000000000f2";

let db: PGlite;
let bizA: string;
let bizB: string;
let pub: string; // public, available (A)
let priv: string; // not public (A)
let sold: string; // public but sold (A)
let pubB: string; // public (B)

async function addProperty(owner: string, biz: string, name: string, isPublic: boolean, status = "available") {
  const { rows } = await as(db, owner, () =>
    db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public, status)
       values ($1, $2, 'condominium', 'Iloilo City', 450000000, $3, $4, $5) returning id`,
      [biz, name, owner, isPublic, status],
    ),
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${AGENT_A}', 'agent-a@example.test', '{"full_name":"Agent A (test)"}'),
      ('${AGENT_B}', 'agent-b@example.test', '{"full_name":"Agent B (test)"}'),
      ('${BUYER}', 'buyer@example.test', '{"full_name":"Buyer (test)","account_type":"buyer"}'),
      ('${BUYER2}', 'buyer2@example.test', '{"full_name":"Buyer Two (test)","account_type":"buyer"}');
  `);
  bizA = await as(db, AGENT_A, async () => (await db.query<{ id: string }>(`select public.create_business('Realty A (test)') as id`)).rows[0]!.id);
  bizB = await as(db, AGENT_B, async () => (await db.query<{ id: string }>(`select public.create_business('Realty B (test)') as id`)).rows[0]!.id);
  pub = await addProperty(AGENT_A, bizA, "Public condo (test)", true);
  priv = await addProperty(AGENT_A, bizA, "Private condo (test)", false);
  sold = await addProperty(AGENT_A, bizA, "Sold condo (test)", true, "sold");
  pubB = await addProperty(AGENT_B, bizB, "B public house (test)", true);
});

describe("account type", () => {
  it("is set from sign-up metadata", async () => {
    const { rows } = await db.query<{ id: string; account_type: string }>(
      `select id, account_type from public.profiles where id in ($1, $2)`,
      [AGENT_A, BUYER],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.account_type]));
    expect(byId[AGENT_A]).toBe("agent");
    expect(byId[BUYER]).toBe("buyer");
  });

  it("can't be changed by the user", async () => {
    await expect(
      as(db, BUYER, () => db.query(`update public.profiles set account_type = 'agent' where id = $1`, [BUYER])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("listing visibility", () => {
  it("shows buyers only public, unsold listings", async () => {
    const { rows } = await as(db, BUYER, () => db.query<{ id: string }>(`select id from public.search_listings()`));
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([pub, pubB].sort());
  });

  it("filters by text, type and budget", async () => {
    const byText = await as(db, BUYER, () => db.query<{ id: string }>(`select id from public.search_listings('house')`));
    expect(byText.rows.map((r) => r.id)).toEqual([pubB]);
    const byBudget = await as(db, BUYER, () => db.query(`select id from public.search_listings(null, null, 100)`));
    expect(byBudget.rows).toHaveLength(0);
  });

  it("returns nothing when signed out", async () => {
    const { rows } = await db.query(`select id from public.search_listings()`);
    expect(rows).toHaveLength(0);
  });

  it("never lets a buyer read the properties table directly", async () => {
    const { rows } = await as(db, BUYER, () => db.query(`select id from public.properties`));
    expect(rows).toHaveLength(0);
  });

  it("hides private and sold listings from get_listing", async () => {
    for (const id of [priv, sold]) {
      const { rows } = await as(db, BUYER, () => db.query(`select id from public.get_listing($1)`, [id]));
      expect(rows).toHaveLength(0);
    }
    const ok = await as(db, BUYER, () => db.query<{ business_name: string }>(`select business_name from public.get_listing($1)`, [pub]));
    expect(ok.rows[0]?.business_name).toBe("Realty A (test)");
  });
});

describe("favorites", () => {
  it("lets a buyer save public listings and keeps the list private", async () => {
    await as(db, BUYER, () => db.query(`insert into public.favorites (user_id, property_id) values ($1, $2)`, [BUYER, pub]));
    const mine = await as(db, BUYER, () => db.query(`select * from public.favorites`));
    const theirs = await as(db, BUYER2, () => db.query(`select * from public.favorites`));
    expect(mine.rows).toHaveLength(1);
    expect(theirs.rows).toHaveLength(0);
  });

  it("refuses to save a private listing", async () => {
    await expect(
      as(db, BUYER, () => db.query(`insert into public.favorites (user_id, property_id) values ($1, $2)`, [BUYER, priv])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("viewing requests", () => {
  let requestId: string;

  it("routes a request to the listing's business, whatever the client sends", async () => {
    const { rows } = await as(db, BUYER, () =>
      db.query<{ id: string; business_id: string; status: string }>(
        `insert into public.viewing_requests (business_id, property_id, buyer_id, buyer_name, buyer_phone, status, agent_note)
         values ($1, $2, $3, 'Buyer (test)', '09170000000', 'completed', 'forged') returning id, business_id, status`,
        [bizB, pub, BUYER],
      ),
    );
    requestId = rows[0]!.id;
    expect(rows[0]!.business_id).toBe(bizA);
    expect(rows[0]!.status).toBe("new");
  });

  it("refuses requests for private listings", async () => {
    await expect(
      as(db, BUYER, () =>
        db.query(
          `insert into public.viewing_requests (business_id, property_id, buyer_id, buyer_name, buyer_phone)
           values ($1, $2, $3, 'Buyer (test)', '09170000000')`,
          [bizA, priv, BUYER],
        ),
      ),
    ).rejects.toThrow(/not available/);
  });

  it("shows the request to the listing's business and the buyer only", async () => {
    const a = await as(db, AGENT_A, () => db.query(`select id from public.viewing_requests`));
    const b = await as(db, AGENT_B, () => db.query(`select id from public.viewing_requests`));
    const other = await as(db, BUYER2, () => db.query(`select id from public.viewing_requests`));
    const buyer = await as(db, BUYER, () => db.query(`select id from public.viewing_requests`));
    expect(a.rows).toHaveLength(1);
    expect(b.rows).toHaveLength(0);
    expect(other.rows).toHaveLength(0);
    expect(buyer.rows).toHaveLength(1);
  });

  it("lets the agent update status but not rewrite what the buyer wrote", async () => {
    await as(db, AGENT_A, () =>
      db.query(`update public.viewing_requests set status = 'contacted', buyer_phone = '000' where id = $1`, [requestId]),
    );
    const { rows } = await db.query<{ status: string; buyer_phone: string }>(
      `select status, buyer_phone from public.viewing_requests where id = $1`,
      [requestId],
    );
    expect(rows[0]).toEqual({ status: "contacted", buyer_phone: "09170000000" });
  });

  it("lets a buyer cancel, but not mark their own request as scheduled", async () => {
    await expect(
      as(db, BUYER, () => db.query(`update public.viewing_requests set status = 'scheduled' where id = $1`, [requestId])),
    ).rejects.toThrow(/only cancel/);
    await as(db, BUYER, () => db.query(`update public.viewing_requests set status = 'closed' where id = $1`, [requestId]));
    const { rows } = await db.query<{ status: string }>(`select status from public.viewing_requests where id = $1`, [requestId]);
    expect(rows[0]!.status).toBe("closed");
  });

  it("stops another business from updating it", async () => {
    const res = await as(db, AGENT_B, () =>
      db.query(`update public.viewing_requests set status = 'scheduled' where id = $1`, [requestId]),
    );
    expect(res.affectedRows).toBe(0);
  });
});
