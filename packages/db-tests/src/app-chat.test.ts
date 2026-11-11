/** In-app chat: buyers see only their own chats, without the team's internal fields. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000009a1";
const BUYER = "00000000-0000-0000-0000-0000000009f1";
const OTHER_BUYER = "00000000-0000-0000-0000-0000000009f2";

let db: PGlite;
let biz: string;
let conv: string;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', '{}'),
      ('${BUYER}', 'b@example.test', '{"account_type":"buyer"}'), ('${OTHER_BUYER}', 'o@example.test', '{"account_type":"buyer"}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Chat Realty (test)') as id`)).rows[0]!.id);
  conv = (
    await db.query<{ id: string }>(
      `insert into public.messenger_conversations (business_id, channel, buyer_id, attention_reason, lead_phone)
       values ($1, 'app', $2, 'Wants a discount (internal)', '09170000000') returning id`,
      [biz, BUYER],
    )
  ).rows[0]!.id;
  await db.query(`insert into public.messenger_messages (conversation_id, business_id, sender, body) values ($1, $2, 'buyer', 'Hello'), ($1, $2, 'ai', 'Hi there')`, [conv, biz]);
});

describe("in-app chat", () => {
  it("lets the buyer read their own chat through the safe functions", async () => {
    const list = await as(db, BUYER, () => db.query<Record<string, unknown>>(`select * from public.my_app_conversations()`));
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ business_name: "Chat Realty (test)", last_message: "Hi there", last_sender: "ai" });
    expect(Object.keys(list.rows[0]!)).not.toContain("attention_reason");
    const msgs = await as(db, BUYER, () => db.query(`select * from public.my_app_messages($1)`, [conv]));
    expect(msgs.rows).toHaveLength(2);
  });

  it("gives buyers no direct table access", async () => {
    const c = await as(db, BUYER, () => db.query(`select * from public.messenger_conversations`));
    const m = await as(db, BUYER, () => db.query(`select * from public.messenger_messages`));
    expect(c.rows).toHaveLength(0);
    expect(m.rows).toHaveLength(0);
  });

  it("hides one buyer's chat from another", async () => {
    const list = await as(db, OTHER_BUYER, () => db.query(`select * from public.my_app_conversations()`));
    const msgs = await as(db, OTHER_BUYER, () => db.query(`select * from public.my_app_messages($1)`, [conv]));
    expect(list.rows).toHaveLength(0);
    expect(msgs.rows).toHaveLength(0);
  });

  it("shows app chats to the business team", async () => {
    const c = await as(db, OWNER, () => db.query(`select channel from public.messenger_conversations`));
    expect(c.rows).toEqual([{ channel: "app" }]);
  });

  it("allows one app chat per buyer per business and checks the shape", async () => {
    await expect(
      db.query(`insert into public.messenger_conversations (business_id, channel, buyer_id) values ($1, 'app', $2)`, [biz, BUYER]),
    ).rejects.toThrow(/duplicate key/);
    await expect(db.query(`insert into public.messenger_conversations (business_id, channel) values ($1, 'app')`, [biz])).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`insert into public.messenger_conversations (business_id, channel, buyer_id) values ($1, 'messenger', $2)`, [biz, OTHER_BUYER]),
    ).rejects.toThrow(/check constraint/);
  });
});
