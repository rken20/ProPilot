/**
 * Cross-tenant isolation tests. Runs the real Phase 1 migration in an in-memory
 * Postgres (PGlite), with a minimal stand-in for Supabase's `auth` schema, then
 * acts as different signed-in users and checks what each one can see and do.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(import.meta.dirname, "../../../supabase/migrations");

// Minimal Supabase auth stand-in: users table, auth.uid() from a session setting,
// and the `authenticated` role that real client requests run as.
const AUTH_STUB = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role authenticated nologin;
  grant usage on schema auth to authenticated;
`;

const GRANTS = `
  grant usage on schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`;

const ANA = "00000000-0000-0000-0000-00000000000a"; // owner of Business A
const BEN = "00000000-0000-0000-0000-00000000000b"; // owner of Business B
const CARL = "00000000-0000-0000-0000-00000000000c"; // agent in Business A

let db: PGlite;
let bizA: string;
let bizB: string;

/** Run `fn` as a signed-in user, subject to RLS. */
async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const file of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(GRANTS);
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ANA}', 'ana@example.test', '{"full_name":"Ana (test)"}'),
      ('${BEN}', 'ben@example.test', '{"full_name":"Ben (test)"}'),
      ('${CARL}', 'carl@example.test', '{"full_name":"Carl (test)"}');
  `);

  bizA = await as(ANA, async () =>
    (await db.query<{ id: string }>(`select public.create_business('Test Realty A') as id`)).rows[0]!.id,
  );
  bizB = await as(BEN, async () =>
    (await db.query<{ id: string }>(`select public.create_business('Test Realty B') as id`)).rows[0]!.id,
  );

  // Carl joins Business A as an agent (done server-side in the app via an invitation).
  await db.query(`insert into public.business_members (business_id, user_id, role) values ($1, $2, 'agent')`, [
    bizA,
    CARL,
  ]);

  await as(ANA, () =>
    db.query(
      `insert into public.properties (business_id, name, type, location, price_minor, created_by)
       values ($1, 'A Condo (test)', 'condominium', 'Iloilo City', 450000000, $2)`,
      [bizA, ANA],
    ),
  );
  await as(BEN, () =>
    db.query(
      `insert into public.properties (business_id, name, type, location, price_minor, created_by)
       values ($1, 'B House (test)', 'house_and_lot', 'Bacolod City', 650000000, $2)`,
      [bizB, BEN],
    ),
  );
});

describe("tenant isolation", () => {
  it("creates a profile for every new auth user", async () => {
    const { rows } = await db.query(`select count(*)::int as n from public.profiles`);
    expect(rows[0]).toEqual({ n: 3 });
  });

  it("shows each owner only their own business", async () => {
    const a = await as(ANA, () => db.query<{ id: string }>(`select id from public.businesses`));
    const b = await as(BEN, () => db.query<{ id: string }>(`select id from public.businesses`));
    expect(a.rows.map((r) => r.id)).toEqual([bizA]);
    expect(b.rows.map((r) => r.id)).toEqual([bizB]);
  });

  it("never returns another business's properties", async () => {
    const a = await as(ANA, () => db.query<{ name: string }>(`select name from public.properties`));
    expect(a.rows.map((r) => r.name)).toEqual(["A Condo (test)"]);
    const b = await as(BEN, () =>
      db.query(`select * from public.properties where business_id = $1`, [bizA]),
    );
    expect(b.rows).toHaveLength(0);
  });

  it("blocks inserting a property into another business", async () => {
    await expect(
      as(BEN, () =>
        db.query(
          `insert into public.properties (business_id, name, type, location, price_minor, created_by)
           values ($1, 'Sneaky (test)', 'lot', 'Nowhere', 1, $2)`,
          [bizA, BEN],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("silently changes nothing when updating another business's rows", async () => {
    const res = await as(BEN, () =>
      db.query(`update public.properties set price_minor = 1 where business_id = $1`, [bizA]),
    );
    expect(res.affectedRows).toBe(0);
  });

  it("blocks adding yourself to another business", async () => {
    await expect(
      as(BEN, () =>
        db.query(`insert into public.business_members (business_id, user_id, role) values ($1, $2, 'owner')`, [
          bizA,
          BEN,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("hides other tenants' profiles", async () => {
    const { rows } = await as(BEN, () => db.query<{ id: string }>(`select id from public.profiles`));
    expect(rows.map((r) => r.id)).toEqual([BEN]);
  });
});

describe("roles inside one business", () => {
  it("lets an agent read properties but not create them", async () => {
    const { rows } = await as(CARL, () => db.query(`select id from public.properties`));
    expect(rows).toHaveLength(1);
    await expect(
      as(CARL, () =>
        db.query(
          `insert into public.properties (business_id, name, type, location, price_minor, created_by)
           values ($1, 'Agent listing (test)', 'lot', 'Iloilo', 1, $2)`,
          [bizA, CARL],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("hides the audit log from agents but shows it to owners", async () => {
    const carl = await as(CARL, () => db.query(`select * from public.audit_logs`));
    const ana = await as(ANA, () => db.query(`select * from public.audit_logs`));
    expect(carl.rows).toHaveLength(0);
    expect(ana.rows.length).toBeGreaterThan(0);
  });

  it("stops a user from making themselves superadmin", async () => {
    await expect(
      as(ANA, () => db.query(`update public.profiles set is_superadmin = true where id = $1`, [ANA])),
    ).rejects.toThrow(/row-level security/);
  });
});
