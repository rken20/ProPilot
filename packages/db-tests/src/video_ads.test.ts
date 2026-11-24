/**
 * Video Ad Maker: only the server records a video ad, the month's allowance
 * holds, and a business sees only its own.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000a00a1";
const MARKETER = "00000000-0000-0000-0000-0000000a00a2";
const RIVAL = "00000000-0000-0000-0000-0000000a00b1";

let db: PGlite;
let biz: string;
let rivalBiz: string;
let listing: string;
let rivalListing: string;

const TEXT = `'{"hook":"House in Pototan","lines":["3 bedrooms"],"cta":"Message us"}'::jsonb`;
const start = (user: string, limit: number | null, property = listing, business = biz, template = "showcase", shape = "vertical") =>
  db.query<{ id: string | null }>(`select public.video_ad_start($1, $2, $3, $4, $5, $6, ${TEXT}) as id`, [business, user, limit, property, template, shape]).then((r) => r.rows[0]!.id);

beforeAll(async () => {
  db = await freshDb();
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
     ('${OWNER}', 'owner@example.test', '{}'), ('${MARKETER}', 'mk@example.test', '{}'), ('${RIVAL}', 'rival@example.test', '{}');`,
  );
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Video Realty (test)') as id`)).rows[0]!.id);
  rivalBiz = await as(db, RIVAL, async () => (await db.query<{ id: string }>(`select public.create_business('Rival Realty (test)') as id`)).rows[0]!.id);
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'marketing', 'active')`, [biz, MARKETER]);
  const add = async (b: string, by: string) =>
    (await db.query<{ id: string }>(`insert into public.properties (business_id, name, type, location, price_minor, created_by) values ($1, 'House (test)', 'house_and_lot', 'Pototan', 250000000, $2) returning id`, [b, by])).rows[0]!.id;
  listing = await add(biz, OWNER);
  rivalListing = await add(rivalBiz, RIVAL);
});

describe("making a video ad", () => {
  it("can only be recorded by the server, for someone on the team and a listing of the business", async () => {
    await expect(as(db, OWNER, () => start(OWNER, 10))).rejects.toThrow(/permission denied/);
    expect(await start(RIVAL, 10)).toBeNull();
    expect(await start(OWNER, 10, rivalListing)).toBeNull();
    await expect(
      as(db, OWNER, () => db.query(`insert into public.video_ads (business_id, property_id, template, shape, ad_text) values ($1, $2, 'showcase', 'vertical', '{}'::jsonb)`, [biz, listing])),
    ).rejects.toThrow(/row-level security/);
  });

  it("stops at the month's allowance, counted across the whole team", async () => {
    expect(await start(OWNER, 2)).toBeTruthy();
    expect(await start(MARKETER, 2)).toBeTruthy();
    expect(await start(OWNER, 2)).toBeNull();
    expect(await start(OWNER, 0)).toBeNull();
    expect(await start(OWNER, null)).toBeTruthy();
  });

  it("takes only the templates and shapes that exist", async () => {
    await expect(start(OWNER, null, listing, biz, "fireworks")).rejects.toThrow(/check/);
    await expect(start(OWNER, null, listing, biz, "bold", "round")).rejects.toThrow(/check/);
  });

  it("is listed for the team only, and can't be changed or removed by them", async () => {
    expect((await as(db, MARKETER, () => db.query(`select id from public.video_ads`))).rows).toHaveLength(3);
    expect((await as(db, RIVAL, () => db.query(`select id from public.video_ads`))).rows).toHaveLength(0);
    await as(db, OWNER, () => db.query(`delete from public.video_ads`));
    await as(db, OWNER, () => db.query(`update public.video_ads set template = 'bold'`));
    const rows = await db.query<{ template: string }>(`select template from public.video_ads`);
    expect(rows.rows.map((r) => r.template)).toEqual(["showcase", "showcase", "showcase"]);
  });
});

describe("plans", () => {
  it("give 10 video ads a month to Pro and 30 to Agency, none to Free and Basic", async () => {
    const rows = await db.query<{ code: string; limit: number | null }>(
      `select p.code, e."limit" from public.plan_entitlements e join public.plans p on p.id = e.plan_id where e.feature_key = 'ai_video_generations' order by p.code`,
    );
    expect(rows.rows).toEqual([
      { code: "agency", limit: 30 },
      { code: "basic", limit: 0 },
      { code: "free", limit: 0 },
      { code: "pro", limit: 10 },
    ]);
  });
});
