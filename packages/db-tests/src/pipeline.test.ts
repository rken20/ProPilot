/** Pipeline: prospects are fed by viewing requests and chats, only the sales team sees them, and agents' tasks are server-written. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-000000000ba1";
const AGENT = "00000000-0000-0000-0000-000000000ba2";
const MARKETER = "00000000-0000-0000-0000-000000000ba3";
const OTHER_OWNER = "00000000-0000-0000-0000-000000000bb1";
const BUYER = "00000000-0000-0000-0000-000000000bf1";

let db: PGlite;
let biz: string;
let prop: string;
let page: string;

type Prospect = { id: string; source: string; stage: string; buyer_id: string | null; name: string | null; phone: string | null; closed_at: string | null };
const prospects = () => db.query<Prospect>(`select * from public.prospects order by created_at`).then((r) => r.rows);
const events = (pid: string) =>
  db.query<{ kind: string; body: string; actor: string | null }>(`select kind, body, actor from public.prospect_events where prospect_id = $1 order by created_at, kind`, [pid]).then((r) => r.rows);

/** A viewing request for a new listing (buyers may only have one open request per listing). */
async function requestViewing(): Promise<string> {
  const listing = (
    await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public)
       values ($1, 'Lot (test)', 'lot', 'Cainta', 100, $2, true) returning id`,
      [biz, OWNER],
    )
  ).rows[0]!.id;
  return as(db, BUYER, async () =>
    (
      await db.query<{ id: string }>(
        `insert into public.viewing_requests (business_id, property_id, buyer_id, buyer_name, buyer_phone) values ($1, $2, $3, 'Maria Santos', '09171234567') returning id`,
        [biz, listing, BUYER],
      )
    ).rows[0]!.id,
  );
}

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', '{"full_name":"Ken Owner"}'), ('${AGENT}', 'agent@example.test', '{"full_name":"Ana Agent"}'),
      ('${MARKETER}', 'mk@example.test', '{}'), ('${OTHER_OWNER}', 'other@example.test', '{}'),
      ('${BUYER}', 'buyer@example.test', '{"account_type":"buyer","full_name":"Maria Santos"}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('P Realty (test)') as id`)).rows[0]!.id);
  await as(db, OTHER_OWNER, () => db.query(`select public.create_business('Other (test)')`));
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active'), ($1, $3, 'marketing', 'active')`, [
    biz,
    AGENT,
    MARKETER,
  ]);
  prop = await as(db, OWNER, async () =>
    (
      await db.query<{ id: string }>(
        `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public)
         values ($1, 'Condo (test)', 'condominium', 'Pasig', 100, $2, true) returning id`,
        [biz, OWNER],
      )
    ).rows[0]!.id,
  );
  page = (
    await db.query<{ id: string }>(
      `insert into public.facebook_pages (business_id, page_id, name, page_token_enc, fb_user_id) values ($1, '2001', 'Page (test)', 'v1.x', '9') returning id`,
      [biz],
    )
  ).rows[0]!.id;
});

describe("prospects from viewing requests", () => {
  it("creates one prospect per buyer, linked to each request", async () => {
    const first = await requestViewing();
    const second = await requestViewing();
    const rows = await prospects();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "viewing_request", stage: "inquiry", buyer_id: BUYER, name: "Maria Santos", phone: "09171234567" });
    const links = await db.query<{ prospect_id: string }>(`select prospect_id from public.viewing_requests where id in ($1, $2)`, [first, second]);
    expect(links.rows.every((r) => r.prospect_id === rows[0]!.id)).toBe(true);
    expect((await events(rows[0]!.id)).map((e) => e.kind)).toEqual(["created", "viewing", "viewing"]);
  });

  it("moves to Viewing when the team schedules one, and records who did it", async () => {
    const [p] = await prospects();
    const vr = (await db.query<{ id: string }>(`select id from public.viewing_requests limit 1`)).rows[0]!.id;
    await as(db, AGENT, () => db.query(`update public.viewing_requests set status = 'scheduled' where id = $1`, [vr]));
    expect((await prospects())[0]!.stage).toBe("viewing");
    const ev = await events(p!.id);
    expect(ev).toContainEqual({ kind: "stage", body: "Moved to Viewing", actor: AGENT });
    expect(ev).toContainEqual({ kind: "viewing", body: "Viewing scheduled", actor: AGENT });
  });

  it("doesn't let a buyer re-link a request", async () => {
    const vr = (await db.query<{ id: string; prospect_id: string }>(`select id, prospect_id from public.viewing_requests limit 1`)).rows[0]!;
    const fake = (await db.query<{ id: string }>(`insert into public.prospects (business_id, name) values ($1, 'Fake') returning id`, [biz])).rows[0]!.id;
    await as(db, BUYER, () => db.query(`update public.viewing_requests set prospect_id = $2, status = 'closed' where id = $1`, [vr.id, fake]));
    expect((await db.query(`select prospect_id from public.viewing_requests where id = $1`, [vr.id])).rows[0]).toEqual({ prospect_id: vr.prospect_id });
    await db.query(`delete from public.prospects where id = $1`, [fake]);
  });
});

describe("who sees the pipeline", () => {
  it("is the owner, admins and agents of the business only", async () => {
    for (const who of [OWNER, AGENT]) {
      expect((await as(db, who, () => db.query(`select id from public.prospects`))).rows.length).toBeGreaterThan(0);
      expect((await as(db, who, () => db.query(`select id from public.prospect_events`))).rows.length).toBeGreaterThan(0);
    }
    for (const who of [OTHER_OWNER, MARKETER, BUYER]) {
      expect((await as(db, who, () => db.query(`select id from public.prospects`))).rows).toHaveLength(0);
      expect((await as(db, who, () => db.query(`select id from public.prospect_events`))).rows).toHaveLength(0);
    }
  });
});

describe("editing prospects", () => {
  it("marks hand-added prospects as manual, whatever the client sends", async () => {
    const row = await as(db, AGENT, async () =>
      (
        await db.query<Prospect & { created_by: string }>(
          `insert into public.prospects (business_id, name, source, buyer_id) values ($1, 'Walk-in (test)', 'messenger', $2) returning *`,
          [biz, BUYER],
        )
      ).rows[0]!,
    );
    expect(row).toMatchObject({ source: "manual", buyer_id: null, created_by: AGENT, stage: "inquiry" });
    await expect(
      as(db, MARKETER, () => db.query(`insert into public.prospects (business_id, name) values ($1, 'x')`, [biz])),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps source and buyer fixed and sets the closed time when won", async () => {
    const walkIn = (await db.query<{ id: string }>(`select id from public.prospects where name = 'Walk-in (test)'`)).rows[0]!.id;
    await as(db, AGENT, () =>
      db.query(`update public.prospects set stage = 'won', source = 'messenger', buyer_id = $2, deal_value_minor = 500000000 where id = $1`, [walkIn, BUYER]),
    );
    const p = (await db.query<Prospect>(`select * from public.prospects where id = $1`, [walkIn])).rows[0]!;
    expect(p).toMatchObject({ stage: "won", source: "manual", buyer_id: null });
    expect(p.closed_at).not.toBeNull();
  });

  it("lets agents take a lead but only owners and admins assign others", async () => {
    const [p] = await prospects();
    await expect(as(db, AGENT, () => db.query(`update public.prospects set assigned_to = $2 where id = $1`, [p!.id, OWNER]))).rejects.toThrow(
      /only owners and admins/,
    );
    await as(db, AGENT, () => db.query(`update public.prospects set assigned_to = $2 where id = $1`, [p!.id, AGENT]));
    await as(db, OWNER, () => db.query(`update public.prospects set assigned_to = $2 where id = $1`, [p!.id, OWNER]));
    await expect(as(db, OWNER, () => db.query(`update public.prospects set assigned_to = $2 where id = $1`, [p!.id, BUYER]))).rejects.toThrow(
      /not on this team/,
    );
    expect((await events(p!.id)).filter((e) => e.kind === "assigned").map((e) => e.body)).toEqual(["Assigned to Ana Agent", "Assigned to Ken Owner"]);
  });

  it("allows notes in your own name only", async () => {
    const [p] = await prospects();
    await as(db, AGENT, () =>
      db.query(`insert into public.prospect_events (business_id, prospect_id, kind, body, actor) values ($1, $2, 'note', 'Prefers weekends', $3)`, [biz, p!.id, AGENT]),
    );
    for (const [who, kind, actor] of [
      [AGENT, "stage", AGENT],
      [AGENT, "note", OWNER],
      [MARKETER, "note", MARKETER],
      [OTHER_OWNER, "note", OTHER_OWNER],
    ] as const) {
      await expect(
        as(db, who, () =>
          db.query(`insert into public.prospect_events (business_id, prospect_id, kind, body, actor) values ($1, $2, $3, 'x', $4)`, [biz, p!.id, kind, actor]),
        ),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it("lets owners delete, and the request stays with its link cleared", async () => {
    const [p] = await prospects();
    await expect(as(db, AGENT, () => db.query(`delete from public.prospects where id = $1 returning id`, [p!.id]))).resolves.toMatchObject({ rows: [] });
    await as(db, OWNER, () => db.query(`delete from public.prospects where id = $1`, [p!.id]));
    const left = await db.query(`select prospect_id from public.viewing_requests`);
    expect(left.rows.every((r) => (r as { prospect_id: string | null }).prospect_id === null)).toBe(true);
  });
});

describe("prospects from chats", () => {
  it("adds a Messenger visitor once they become a lead, and doesn't bring them back after a delete", async () => {
    const conv = (
      await db.query<{ id: string; prospect_id: string | null }>(
        `insert into public.messenger_conversations (business_id, page_row_id, page_id, psid, display_name) values ($1, $2, '2001', '555', 'Jun Reyes') returning id, prospect_id`,
        [biz, page],
      )
    ).rows[0]!;
    expect(conv.prospect_id).toBeNull();
    await db.query(`update public.messenger_conversations set lead_status = 'new', lead_phone = '09180000000', property_id = $2 where id = $1`, [conv.id, prop]);
    const linked = (await db.query<{ prospect_id: string }>(`select prospect_id from public.messenger_conversations where id = $1`, [conv.id])).rows[0]!.prospect_id;
    const p = (await db.query<Prospect>(`select * from public.prospects where id = $1`, [linked])).rows[0]!;
    expect(p).toMatchObject({ source: "messenger", name: "Jun Reyes", phone: "09180000000", stage: "inquiry" });

    await db.query(`update public.prospects set last_activity_at = now() - interval '5 days' where id = $1`, [linked]);
    await db.query(`insert into public.messenger_messages (conversation_id, business_id, sender, body) values ($1, $2, 'buyer', 'Hello po')`, [conv.id, biz]);
    const fresh = await db.query<{ recent: boolean }>(`select last_activity_at > now() - interval '1 minute' as recent from public.prospects where id = $1`, [linked]);
    expect(fresh.rows[0]!.recent).toBe(true);

    await db.query(`update public.messenger_conversations set lead_status = 'scheduled' where id = $1`, [conv.id]);
    expect((await db.query<Prospect>(`select stage from public.prospects where id = $1`, [linked])).rows[0]!.stage).toBe("viewing");

    await as(db, OWNER, () => db.query(`delete from public.prospects where id = $1`, [linked]));
    await db.query(`update public.messenger_conversations set last_message_at = now() where id = $1`, [conv.id]);
    expect((await db.query(`select prospect_id from public.messenger_conversations where id = $1`, [conv.id])).rows[0]).toEqual({ prospect_id: null });
  });

  it("adds a ProPilot buyer who starts a chat, reusing their prospect", async () => {
    await db.query(`insert into public.messenger_conversations (business_id, channel, buyer_id) values ($1, 'app', $2)`, [biz, BUYER]);
    await requestViewing();
    const mine = (await prospects()).filter((p) => p.buyer_id === BUYER);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ source: "app_chat", name: "Maria Santos" });
  });
});

describe("agent tasks, runs and settings", () => {
  it("are written by the server only", async () => {
    await db.query(`insert into public.agent_tasks (business_id, agent, kind, title, dedupe_key) values ($1, 'pipeline', 'reminder', 'Call Maria', 'k1')`, [biz]);
    await db.query(`insert into public.agent_runs (business_id, agent) values ($1, 'pipeline')`, [biz]);
    await expect(
      db.query(`insert into public.agent_tasks (business_id, agent, kind, title, dedupe_key) values ($1, 'pipeline', 'reminder', 'Again', 'k1')`, [biz]),
    ).rejects.toThrow(/duplicate key/);
    expect((await as(db, AGENT, () => db.query(`select id from public.agent_tasks`))).rows).toHaveLength(1);
    expect((await as(db, AGENT, () => db.query(`select id from public.agent_runs`))).rows).toHaveLength(1);
    expect((await as(db, MARKETER, () => db.query(`select id from public.agent_tasks`))).rows).toHaveLength(0);
    await expect(
      as(db, OWNER, () => db.query(`insert into public.agent_tasks (business_id, agent, kind, title) values ($1, 'pipeline', 'reminder', 'x')`, [biz])),
    ).rejects.toThrow(/row-level security/);
    const upd = await as(db, OWNER, () => db.query(`update public.agent_tasks set status = 'done' returning id`));
    expect(upd.rows).toHaveLength(0);
  });

  it("lets owners and admins change settings in their own name", async () => {
    await as(db, OWNER, () => db.query(`insert into public.agent_settings (business_id, follow_up_days, updated_by) values ($1, 5, $2)`, [biz, OWNER]));
    const agentTry = await as(db, AGENT, () => db.query(`update public.agent_settings set enabled = false, updated_by = $1 returning 1`, [AGENT]));
    expect(agentTry.rows).toHaveLength(0);
    await expect(as(db, OWNER, () => db.query(`update public.agent_settings set enabled = false, updated_by = $1`, [AGENT]))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("keeps the cleanup function for the server", async () => {
    await expect(as(db, OWNER, () => db.query(`select public.prune_pipeline()`))).rejects.toThrow(/permission denied/);
    await db.query(`select public.prune_pipeline()`);
  });
});
