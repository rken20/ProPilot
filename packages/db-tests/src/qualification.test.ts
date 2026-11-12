/** Qualification: buyers own their preferences and choose to share them; only the server scores leads. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-000000000ca1";
const AGENT = "00000000-0000-0000-0000-000000000ca2";
const OTHER_OWNER = "00000000-0000-0000-0000-000000000cb1";
const BUYER = "00000000-0000-0000-0000-000000000cf1";
const OTHER_BUYER = "00000000-0000-0000-0000-000000000cf2";

let db: PGlite;
let biz: string;
let prospect: string;

type Q = { score: number | null; facts_by: string | null; needs_qualify: boolean; budget_max_minor: string | null; temperature: string | null };
const q = () =>
  db
    .query<Q>(`select score, facts_by, needs_qualify, budget_max_minor::text, temperature from public.prospects where id = $1`, [prospect])
    .then((r) => r.rows[0]!);
const checked = () => db.query(`update public.prospects set needs_qualify = false where id = $1`, [prospect]);

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'o@example.test', '{}'), ('${AGENT}', 'a@example.test', '{}'), ('${OTHER_OWNER}', 'x@example.test', '{}'),
      ('${BUYER}', 'b@example.test', '{"account_type":"buyer"}'), ('${OTHER_BUYER}', 'c@example.test', '{"account_type":"buyer"}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Q Realty (test)') as id`)).rows[0]!.id);
  await as(db, OTHER_OWNER, () => db.query(`select public.create_business('Other (test)')`));
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`, [biz, AGENT]);
  const prop = await as(db, OWNER, async () =>
    (
      await db.query<{ id: string }>(
        `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public)
         values ($1, 'Condo (test)', 'condominium', 'Pasig', 100, $2, true) returning id`,
        [biz, OWNER],
      )
    ).rows[0]!.id,
  );
  await as(db, BUYER, () =>
    db.query(`insert into public.viewing_requests (business_id, property_id, buyer_id, buyer_name, buyer_phone) values ($1, $2, $3, 'Maria', '09170000000')`, [
      biz,
      prop,
      BUYER,
    ]),
  );
  prospect = (await db.query<{ id: string }>(`select id from public.prospects`)).rows[0]!.id;
});

describe("buyer preferences", () => {
  it("belong to the buyer alone", async () => {
    await as(db, BUYER, () =>
      db.query(
        `insert into public.buyer_preferences (user_id, budget_max_minor, areas, property_types, timeline, financing) values ($1, 600000000, '{Pasig,Ortigas}', '{condominium}', '1_3_months', 'bank')`,
        [BUYER],
      ),
    );
    expect((await as(db, BUYER, () => db.query(`select * from public.buyer_preferences`))).rows).toHaveLength(1);
    for (const who of [OTHER_BUYER, OWNER, AGENT]) {
      expect((await as(db, who, () => db.query(`select * from public.buyer_preferences`))).rows).toHaveLength(0);
    }
    await expect(
      as(db, OTHER_BUYER, () => db.query(`insert into public.buyer_preferences (user_id) values ($1)`, [BUYER])),
    ).rejects.toThrow(/row-level security|duplicate key/);
    await expect(
      as(db, BUYER, () => db.query(`update public.buyer_preferences set property_types = '{castle}' where user_id = $1`, [BUYER])),
    ).rejects.toThrow(/check constraint/);
  });

  it("are shown to the team of a business the buyer contacted, only while shared", async () => {
    const read = (who: string) => as(db, who, () => db.query<{ areas: string[] }>(`select * from public.prospect_buyer_preferences($1)`, [prospect]));
    expect((await read(AGENT)).rows[0]!.areas).toEqual(["Pasig", "Ortigas"]);
    expect((await read(OTHER_OWNER)).rows).toHaveLength(0);
    expect((await read(OTHER_BUYER)).rows).toHaveLength(0);
    await as(db, BUYER, () => db.query(`update public.buyer_preferences set share_with_agents = false where user_id = $1`, [BUYER]));
    expect((await read(OWNER)).rows).toHaveLength(0);
    await as(db, BUYER, () => db.query(`update public.buyer_preferences set share_with_agents = true where user_id = $1`, [BUYER]));
  });
});

describe("scores and facts", () => {
  it("can only be scored by the server", async () => {
    await db.query(`update public.prospects set score = 80, temperature = 'hot', facts_by = 'ai', budget_max_minor = 500000000 where id = $1`, [prospect]);
    await as(db, AGENT, () => db.query(`update public.prospects set score = 5, temperature = 'cold', score_reason = 'x' where id = $1`, [prospect]));
    expect(await q()).toMatchObject({ score: 80, temperature: "hot", facts_by: "ai" });
  });

  it("marks facts as the team's when they correct them, and lets them hand back to the AI", async () => {
    await checked();
    await as(db, AGENT, () => db.query(`update public.prospects set budget_max_minor = 700000000 where id = $1`, [prospect]));
    expect(await q()).toMatchObject({ facts_by: "team", needs_qualify: true, budget_max_minor: "700000000" });
    await as(db, AGENT, () => db.query(`update public.prospects set facts_by = 'ai' where id = $1`, [prospect]));
    expect((await q()).facts_by).toBe("ai");
    await as(db, AGENT, () => db.query(`update public.prospects set needs_qualify = false where id = $1`, [prospect]));
    expect((await q()).needs_qualify).toBe(true);
  });

  it("needs a fresh check after a buyer message, a note or new preferences", async () => {
    const page = (
      await db.query<{ id: string }>(
        `insert into public.facebook_pages (business_id, page_id, name, page_token_enc, fb_user_id) values ($1, '3001', 'P', 'v1.x', '9') returning id`,
        [biz],
      )
    ).rows[0]!.id;
    const conv = (
      await db.query<{ id: string }>(
        `insert into public.messenger_conversations (business_id, page_row_id, page_id, psid, prospect_id) values ($1, $2, '3001', '42', $3) returning id`,
        [biz, page, prospect],
      )
    ).rows[0]!.id;

    await checked();
    await db.query(`insert into public.messenger_messages (conversation_id, business_id, sender, body) values ($1, $2, 'ai', 'Hello!')`, [conv, biz]);
    expect((await q()).needs_qualify).toBe(false);
    await db.query(`insert into public.messenger_messages (conversation_id, business_id, sender, body) values ($1, $2, 'buyer', 'Up to 6M po')`, [conv, biz]);
    expect((await q()).needs_qualify).toBe(true);

    await checked();
    await as(db, AGENT, () =>
      db.query(`insert into public.prospect_events (business_id, prospect_id, kind, body, actor) values ($1, $2, 'note', 'Pre-approved by BDO', $3)`, [biz, prospect, AGENT]),
    );
    expect((await q()).needs_qualify).toBe(true);

    await checked();
    await as(db, BUYER, () => db.query(`update public.buyer_preferences set timeline = 'asap' where user_id = $1`, [BUYER]));
    expect((await q()).needs_qualify).toBe(true);
  });

  it("lets agents suggest a stage", async () => {
    await db.query(
      `insert into public.agent_tasks (business_id, prospect_id, agent, kind, title, proposed_stage) values ($1, $2, 'qualifier', 'stage', 'Move to Qualified', 'qualified')`,
      [biz, prospect],
    );
    await expect(
      db.query(`insert into public.agent_tasks (business_id, agent, kind, title, proposed_stage) values ($1, 'qualifier', 'stage', 'x', 'nowhere')`, [biz]),
    ).rejects.toThrow(/check constraint/);
  });
});
