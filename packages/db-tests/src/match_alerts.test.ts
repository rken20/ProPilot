/**
 * Match alerts: a buyer's saved preferences and consent. Server only: no
 * signed-in user, not even the seller the buyer inquired with, can read or write them.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER = "00000000-0000-0000-0000-00000000f0a1";
const CONSENT = "I agree that MyHomeSeller saves these preferences and emails me matching properties.";

let db: PGlite;
let biz: string;
let listing: string;
let alert: string;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${OWNER}', 'owner@example.test', '{}');`);
  biz = await as(db, OWNER, async () => (await db.query<{ id: string }>(`select public.create_business('Alert Realty (test)') as id`)).rows[0]!.id);
  listing = (
    await db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, is_public, created_by)
       values ($1, 'House (test)', 'house_and_lot', 'Pavia, Iloilo', 450000000, true, $2) returning id`,
      [biz, OWNER],
    )
  ).rows[0]!.id;
  alert = (
    await db.query<{ id: string }>(
      `insert into public.match_alerts (email, name, budget_max_minor, areas, property_types, source_business_id, source_property_id, consent_text)
       values ('ana@example.test', 'Ana', 500000000, array['Pavia'], array['house_and_lot'], $1, $2, $3) returning id`,
      [biz, listing, CONSENT],
    )
  ).rows[0]!.id;
  await db.query(`insert into public.match_alert_sends (alert_id, property_id) values ($1, $2)`, [alert, listing]);
});

describe("match alerts", () => {
  it("can't be read or written by a signed-in user, even the seller the buyer inquired with", async () => {
    // The test database gives signed-in users rights on every table, so this is row-level security alone holding.
    expect((await as(db, OWNER, () => db.query(`select * from public.match_alerts`))).rows).toHaveLength(0);
    expect((await as(db, OWNER, () => db.query(`select * from public.match_alert_sends`))).rows).toHaveLength(0);
    await expect(
      as(db, OWNER, () => db.query(`insert into public.match_alerts (email, consent_text) values ('x@example.test', $1)`, [CONSENT])),
    ).rejects.toThrow(/row-level security/);
    await expect(as(db, OWNER, () => db.query(`insert into public.match_alert_sends (alert_id, property_id) values ($1, $2)`, [alert, listing]))).rejects.toThrow(
      /row-level security/,
    );
    await as(db, OWNER, () => db.query(`delete from public.match_alerts`));
    await as(db, OWNER, () => db.query(`update public.match_alerts set confirmed_at = now(), email = 'taken@example.test'`));
    const row = (await db.query<{ email: string; confirmed_at: string | null }>(`select email, confirmed_at from public.match_alerts where id = $1`, [alert])).rows[0]!;
    expect(row).toEqual({ email: "ana@example.test", confirmed_at: null });
  });

  it("has row-level security on with no policies", async () => {
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('match_alerts', 'match_alert_sends') order by relname`,
    );
    expect(rls.rows.map((r) => r.relrowsecurity)).toEqual([true, true]);
    const policies = await db.query(`select 1 from pg_policies where tablename in ('match_alerts', 'match_alert_sends')`);
    expect(policies.rows).toHaveLength(0);
  });

  it("starts unconfirmed and expires after a year", async () => {
    const row = (await db.query<{ confirmed_at: string | null; months: number }>(
      `select confirmed_at, round(extract(epoch from (expires_at - created_at)) / 2592000)::int as months from public.match_alerts where id = $1`,
      [alert],
    )).rows[0]!;
    expect(row.confirmed_at).toBeNull();
    expect(row.months).toBe(12);
  });

  it("needs the consent wording, a lowercase email and known values", async () => {
    await expect(db.query(`insert into public.match_alerts (email, consent_text) values ('b@example.test', 'ok')`)).rejects.toThrow(/check constraint/);
    await expect(db.query(`insert into public.match_alerts (email) values ('b@example.test')`)).rejects.toThrow(/null value/);
    await expect(db.query(`insert into public.match_alerts (email, consent_text) values ('B@Example.test', $1)`, [CONSENT])).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`insert into public.match_alerts (email, consent_text, property_types) values ('b@example.test', $1, array['castle'])`, [CONSENT]),
    ).rejects.toThrow(/check constraint/);
  });

  it("keeps the alert when the listing or the business goes, and forgets what was sent", async () => {
    await db.query(`delete from public.properties where id = $1`, [listing]);
    expect((await db.query(`select 1 from public.match_alert_sends where alert_id = $1`, [alert])).rows).toHaveLength(0);
    const row = (await db.query<{ source_property_id: string | null }>(`select source_property_id from public.match_alerts where id = $1`, [alert])).rows[0]!;
    expect(row.source_property_id).toBeNull();
  });

  it("deleting an alert deletes its send history", async () => {
    const other = (
      await db.query<{ id: string }>(
        `insert into public.properties (business_id, name, type, location, price_minor, is_public, created_by)
         values ($1, 'Lot (test)', 'lot', 'Pavia, Iloilo', 150000000, true, $2) returning id`,
        [biz, OWNER],
      )
    ).rows[0]!.id;
    await db.query(`insert into public.match_alert_sends (alert_id, property_id) values ($1, $2)`, [alert, other]);
    await db.query(`delete from public.match_alerts where id = $1`, [alert]);
    expect((await db.query(`select 1 from public.match_alert_sends where property_id = $1`, [other])).rows).toHaveLength(0);
  });
});
