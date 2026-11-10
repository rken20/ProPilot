/**
 * Cross-tenant isolation tests. Runs the real Phase 1 migration in an in-memory
 * Postgres (PGlite), with a minimal stand-in for Supabase's `auth` schema, then
 * acts as different signed-in users and checks what each one can see and do.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ANA, BEN, CARL, as as asUser, freshDb } from "./harness";

let db: PGlite;
let bizA: string;
let bizB: string;

/** Run `fn` as a signed-in user, subject to RLS. */
function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return asUser(db, userId, fn);
}

beforeAll(async () => {
  db = await freshDb();
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

  it("stops an agent from changing roles", async () => {
    const res = await as(CARL, () =>
      db.query(`update public.business_members set role = 'admin' where business_id = $1 and user_id = $2`, [bizA, CARL]),
    );
    expect(res.affectedRows).toBe(0);
  });

  it("never lets the owner be demoted or removed", async () => {
    await expect(
      as(ANA, () =>
        db.query(`update public.business_members set role = 'agent' where business_id = $1 and user_id = $2`, [bizA, ANA]),
      ),
    ).rejects.toThrow(/owner cannot/);
    await expect(
      as(ANA, () => db.query(`delete from public.business_members where business_id = $1 and user_id = $2`, [bizA, ANA])),
    ).rejects.toThrow(/owner cannot/);
  });

  it("stops a user from making themselves superadmin", async () => {
    await expect(
      as(ANA, () => db.query(`update public.profiles set is_superadmin = true where id = $1`, [ANA])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("invitations", () => {
  const DANA = "00000000-0000-0000-0000-00000000000d";
  const hash = (t: string) => `encode(sha256(convert_to('${t}', 'UTF8')), 'hex')`;

  beforeAll(async () => {
    await db.exec(`insert into auth.users (id, email) values ('${DANA}', 'dana@example.test')`);
  });

  it("copies the sign-in email onto the profile", async () => {
    const { rows } = await db.query<{ email: string }>(`select email from public.profiles where id = $1`, [DANA]);
    expect(rows[0]?.email).toBe("dana@example.test");
  });

  it("lets an owner invite, and only the invited email can accept", async () => {
    await as(ANA, () =>
      db.query(
        `insert into public.invitations (business_id, email, role, token_hash, invited_by)
         values ($1, 'dana@example.test', 'marketing', ${hash("tok-dana")}, $2)`,
        [bizA, ANA],
      ),
    );
    // Ben has a different email: rejected.
    await expect(as(BEN, () => db.query(`select public.accept_invitation('tok-dana')`))).rejects.toThrow(
      /different email/,
    );
    // Dana accepts and becomes a marketing member of Business A only.
    await as(DANA, () => db.query(`select public.accept_invitation('tok-dana')`));
    const { rows } = await as(DANA, () => db.query<{ id: string }>(`select id from public.businesses`));
    expect(rows.map((r) => r.id)).toEqual([bizA]);
    const role = await db.query<{ role: string }>(
      `select role from public.business_members where business_id = $1 and user_id = $2`,
      [bizA, DANA],
    );
    expect(role.rows[0]?.role).toBe("marketing");
  });

  it("rejects a reused or unknown token", async () => {
    await expect(as(DANA, () => db.query(`select public.accept_invitation('tok-dana')`))).rejects.toThrow(/already used/);
    await expect(as(DANA, () => db.query(`select public.accept_invitation('nope')`))).rejects.toThrow(/not found/);
  });

  it("hides invitations from other businesses and from agents", async () => {
    const ben = await as(BEN, () => db.query(`select * from public.invitations`));
    const carl = await as(CARL, () => db.query(`select * from public.invitations`));
    expect(ben.rows).toHaveLength(0);
    expect(carl.rows).toHaveLength(0);
  });

  it("stops an admin from inviting another admin", async () => {
    const EVE = "00000000-0000-0000-0000-00000000000e";
    await db.exec(`insert into auth.users (id, email) values ('${EVE}', 'eve@example.test')`);
    await db.query(`insert into public.business_members (business_id, user_id, role) values ($1, $2, 'admin')`, [bizA, EVE]);
    await expect(
      as(EVE, () =>
        db.query(
          `insert into public.invitations (business_id, email, role, token_hash, invited_by)
           values ($1, 'x@example.test', 'admin', ${hash("tok-x")}, $2)`,
          [bizA, EVE],
        ),
      ),
    ).rejects.toThrow(/admins can only invite/);
    // And can't demote another admin's peers or the owner.
    await expect(
      as(EVE, () =>
        db.query(`update public.business_members set status = 'deactivated' where business_id = $1 and user_id = $2`, [bizA, ANA]),
      ),
    ).rejects.toThrow(/owner cannot/);
  });
});
