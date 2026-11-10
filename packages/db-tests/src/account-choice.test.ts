/** Choosing buyer or agent once, for people who sign in with Google. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const GOOGLE_USER = "00000000-0000-0000-0000-0000000002a1";
const EMAIL_BUYER = "00000000-0000-0000-0000-0000000002b1";

let db: PGlite;
const profile = async (id: string) =>
  (await db.query<{ account_type: string; account_type_chosen: boolean; full_name: string }>(
    `select account_type, account_type_chosen, full_name from public.profiles where id = $1`,
    [id],
  )).rows[0]!;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${GOOGLE_USER}', 'g@example.test', '{"name":"Gina Google (test)"}'),
      ('${EMAIL_BUYER}', 'e@example.test', '{"full_name":"Eve Email (test)","account_type":"buyer"}');
  `);
});

describe("account type choice", () => {
  it("marks email sign-ups as chosen and Google sign-ups as not yet chosen", async () => {
    expect(await profile(EMAIL_BUYER)).toMatchObject({ account_type: "buyer", account_type_chosen: true });
    expect(await profile(GOOGLE_USER)).toMatchObject({ account_type: "agent", account_type_chosen: false, full_name: "Gina Google (test)" });
  });

  it("lets a Google user choose once, then ignores later attempts", async () => {
    await as(db, GOOGLE_USER, () => db.query(`select public.choose_account_type('buyer')`));
    expect(await profile(GOOGLE_USER)).toMatchObject({ account_type: "buyer", account_type_chosen: true });
    const again = await as(db, GOOGLE_USER, () => db.query<{ t: string }>(`select public.choose_account_type('agent') as t`));
    expect(again.rows[0]!.t).toBe("buyer");
  });

  it("won't let an email user switch type with the function", async () => {
    await as(db, EMAIL_BUYER, () => db.query(`select public.choose_account_type('agent')`));
    expect((await profile(EMAIL_BUYER)).account_type).toBe("buyer");
  });

  it("won't let anyone reset the chosen flag with a profile update", async () => {
    await expect(
      as(db, GOOGLE_USER, () => db.query(`update public.profiles set account_type_chosen = false where id = $1`, [GOOGLE_USER])),
    ).rejects.toThrow(/row-level security/);
  });
});
