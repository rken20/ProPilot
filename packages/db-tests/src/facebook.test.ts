/** Facebook Pages: tokens stay server-only, members see their own business's Pages and posts. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-0000000006a1";
const OTHER_OWNER = "00000000-0000-0000-0000-0000000006b1";
const BUYER = "00000000-0000-0000-0000-0000000006f1";

let db: PGlite;
let biz: string;
let otherBiz: string;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', '{}'), ('${OTHER_OWNER}', 'other@example.test', '{}'),
      ('${BUYER}', 'buyer@example.test', '{"account_type":"buyer"}');
  `);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('F Realty (test)') as id`)).rows[0]!.id);
  otherBiz = await as(db, OTHER_OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Other (test)') as id`)).rows[0]!.id);
  // Server-side rows (service role bypasses RLS).
  await db.query(
    `insert into public.facebook_pages (business_id, page_id, name, page_token_enc, tasks, fb_user_id, connected_by)
     values ($1, '1001', 'F Realty Page (test)', 'v1.secret', '{CREATE_CONTENT}', '555', $2)`,
    [biz, OWNER],
  );
  await db.query(
    `insert into public.facebook_posts (business_id, page_id, page_name, kind, status, fb_post_id)
     values ($1, '1001', 'F Realty Page (test)', 'photos', 'published', '1001_1')`,
    [biz],
  );
});

describe("facebook pages", () => {
  it("never exposes Page tokens to clients", async () => {
    const own = await as(db, OWNER, () => db.query(`select * from public.facebook_pages`));
    expect(own.rows).toHaveLength(0);
  });

  it("lists the business's Pages to members, without tokens", async () => {
    const { rows } = await as(db, OWNER, () => db.query<Record<string, unknown>>(`select * from public.business_facebook_pages($1)`, [biz]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ page_id: "1001", name: "F Realty Page (test)" });
    expect(Object.keys(rows[0]!)).not.toContain("page_token_enc");
  });

  it("hides another business's Pages", async () => {
    const other = await as(db, OTHER_OWNER, () => db.query(`select * from public.business_facebook_pages($1)`, [biz]));
    const buyer = await as(db, BUYER, () => db.query(`select * from public.business_facebook_pages($1)`, [biz]));
    expect(other.rows).toHaveLength(0);
    expect(buyer.rows).toHaveLength(0);
  });

  it("doesn't let clients add or change Pages", async () => {
    await expect(
      as(db, OWNER, () =>
        db.query(
          `insert into public.facebook_pages (business_id, page_id, name, page_token_enc, fb_user_id) values ($1, '2', 'x', 'y', '3')`,
          [otherBiz],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("shows the post log to members only", async () => {
    const own = await as(db, OWNER, () => db.query(`select * from public.facebook_posts`));
    const other = await as(db, OTHER_OWNER, () => db.query(`select * from public.facebook_posts`));
    expect(own.rows).toHaveLength(1);
    expect(other.rows).toHaveLength(0);
    await expect(
      as(db, OWNER, () =>
        db.query(`insert into public.facebook_posts (business_id, page_id, page_name, kind, status) values ($1, '1', 'x', 'text', 'published')`, [
          biz,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps deletion requests server-only", async () => {
    await db.query(`insert into public.meta_deletion_requests (confirmation_code, fb_user_id) values ('abcdefgh12', '555')`);
    const { rows } = await as(db, OWNER, () => db.query(`select * from public.meta_deletion_requests`));
    expect(rows).toHaveLength(0);
  });
});
