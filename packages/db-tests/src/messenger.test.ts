/** Messenger: the team that can reply reads its own conversations; nobody else does; only the server writes. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000007a1";
const MARKETER = "00000000-0000-0000-0000-0000000007a2";
const OTHER_OWNER = "00000000-0000-0000-0000-0000000007b1";
const BUYER = "00000000-0000-0000-0000-0000000007f1";

let db: PGlite;
let biz: string;
let conv: string;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', '{}'), ('${MARKETER}', 'mk@example.test', '{}'),
      ('${OTHER_OWNER}', 'other@example.test', '{}'), ('${BUYER}', 'buyer@example.test', '{"account_type":"buyer"}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('M Realty (test)') as id`)).rows[0]!.id);
  await as(db, OTHER_OWNER, () => db.query(`select public.create_business('Other (test)')`));
  await db.query(`insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'marketing', 'active')`, [biz, MARKETER]);
  const page = (
    await db.query<{ id: string }>(
      `insert into public.facebook_pages (business_id, page_id, name, page_token_enc, fb_user_id) values ($1, '1001', 'Page (test)', 'v1.x', '9') returning id`,
      [biz],
    )
  ).rows[0]!.id;
  conv = (
    await db.query<{ id: string }>(
      `insert into public.messenger_conversations (business_id, page_row_id, page_id, psid, lead_phone) values ($1, $2, '1001', '777', '09170000000') returning id`,
      [biz, page],
    )
  ).rows[0]!.id;
  await db.query(`insert into public.messenger_messages (conversation_id, business_id, sender, body, mid) values ($1, $2, 'buyer', 'Available pa po?', 'm1')`, [conv, biz]);
});

describe("messenger", () => {
  it("lets the owner read conversations and messages", async () => {
    const c = await as(db, OWNER, () => db.query(`select * from public.messenger_conversations`));
    const m = await as(db, OWNER, () => db.query(`select * from public.messenger_messages`));
    expect(c.rows).toHaveLength(1);
    expect(m.rows).toHaveLength(1);
  });

  it("hides them from other businesses, buyers and the marketing role", async () => {
    for (const who of [OTHER_OWNER, BUYER, MARKETER]) {
      const c = await as(db, who, () => db.query(`select * from public.messenger_conversations`));
      const m = await as(db, who, () => db.query(`select * from public.messenger_messages`));
      expect(c.rows, who).toHaveLength(0);
      expect(m.rows, who).toHaveLength(0);
    }
  });

  it("doesn't let clients write or change them", async () => {
    await expect(
      as(db, OWNER, () =>
        db.query(`insert into public.messenger_messages (conversation_id, business_id, sender, body) values ($1, $2, 'agent', 'hi')`, [conv, biz]),
      ),
    ).rejects.toThrow(/row-level security/);
    const upd = await as(db, OWNER, () => db.query(`update public.messenger_conversations set mode = 'human' returning id`));
    expect(upd.rows).toHaveLength(0);
  });

  it("drops a duplicate webhook delivery", async () => {
    await expect(
      db.query(`insert into public.messenger_messages (conversation_id, business_id, sender, body, mid) values ($1, $2, 'buyer', 'again', 'm1')`, [conv, biz]),
    ).rejects.toThrow(/duplicate key/);
  });

  it("shows the Messenger setting to members", async () => {
    const { rows } = await as(db, OWNER, () => db.query<{ messenger_enabled: boolean }>(`select * from public.business_facebook_pages($1)`, [biz]));
    expect(rows[0]!.messenger_enabled).toBe(false);
  });

  it("keeps the cleanup server-only and removes year-old conversations", async () => {
    await expect(as(db, OWNER, () => db.query(`select public.prune_messenger()`))).rejects.toThrow(/permission denied/);
    await db.query(`update public.messenger_conversations set last_message_at = now() - interval '13 months'`);
    await db.query(`select public.prune_messenger()`);
    const left = await db.query(`select * from public.messenger_messages`);
    expect(left.rows).toHaveLength(0);
  });
});
