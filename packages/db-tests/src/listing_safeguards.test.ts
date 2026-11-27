/**
 * Safeguards against fake listings: the seller declaration, reports, taking a
 * listing down and verified sellers. A seller can't forge a declaration, can't
 * see reports about them, can't put back a listing the app admin took down,
 * and can't mark themselves verified.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const ADMIN = "00000000-0000-0000-0000-0000005afe01";
const OWNER = "00000000-0000-0000-0000-0000005afe02";
const AGENT = "00000000-0000-0000-0000-0000005afe03";
const OTHER = "00000000-0000-0000-0000-0000005afe04";

let db: PGlite;
let biz: string;
let otherBiz: string;

type Row = {
  id: string;
  seller_capacity: string | null;
  seller_license: string | null;
  declared_at: string | null;
  declared_by: string | null;
  is_public: boolean;
  taken_down_at: string | null;
};
const COLS = `id, seller_capacity, seller_license, declared_at::text, declared_by, is_public, taken_down_at::text`;
const read = async (id: string) =>
  (
    await db.query<Row>(`select ${COLS} from public.properties where id = $1`, [
      id,
    ])
  ).rows[0]!;
const list = (who: string, b: string, extra: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = {
    business_id: b,
    name: "House (test)",
    type: "house_and_lot",
    location: "Pototan, Iloilo",
    price_minor: 250000000,
    created_by: who,
    ...extra,
  };
  const keys = Object.keys(row);
  return as(
    db,
    who,
    async () =>
      (
        await db.query<{ id: string }>(
          `insert into public.properties (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
          Object.values(row),
        )
      ).rows[0]!.id,
  );
};
const report = (
  property: string,
  source: string,
  reason: string,
  details: string | null = null,
  contact: string | null = null,
) =>
  db
    .query<{ id: string | null }>(
      `select public.report_listing($1, $2, $3, $4, $5) as id`,
      [property, source, reason, details, contact],
    )
    .then((r) => r.rows[0]!.id);
const count = (who: string, table: string) =>
  as(db, who, () => db.query(`select 1 from public.${table}`)).then(
    (r) => r.rows.length,
  );

beforeAll(async () => {
  db = await freshDb();
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
     ('${ADMIN}', 'admin@example.test', '{}'), ('${OWNER}', 'owner@example.test', '{}'),
     ('${AGENT}', 'agent@example.test', '{}'), ('${OTHER}', 'other@example.test', '{}');`,
  );
  await db.query(
    `update public.profiles set is_superadmin = true where id = $1`,
    [ADMIN],
  );
  biz = await as(
    db,
    OWNER,
    async () =>
      (
        await db.query<{ id: string }>(
          `select public.create_business('Owner Realty (test)') as id`,
        )
      ).rows[0]!.id,
  );
  otherBiz = await as(
    db,
    OTHER,
    async () =>
      (
        await db.query<{ id: string }>(
          `select public.create_business('Other Homes (test)') as id`,
        )
      ).rows[0]!.id,
  );
  await db.query(
    `insert into public.business_members (business_id, user_id, role, status) values ($1, $2, 'agent', 'active')`,
    [biz, AGENT],
  );
});

describe("the seller declaration", () => {
  it("is stamped by the database with who declared and when, whatever the request says", async () => {
    const id = await list(OWNER, biz, {
      is_public: true,
      seller_capacity: "owner",
      declared_by: OTHER,
      declared_at: "2020-01-01",
    });
    const row = await read(id);
    expect(row.declared_by).toBe(OWNER);
    expect(row.declared_at!.slice(0, 4)).not.toBe("2020");
  });

  it("is needed before a listing can have a public page", async () => {
    await expect(list(OWNER, biz, { is_public: true })).rejects.toThrow(
      /needs a seller declaration/,
    );
    const id = await list(OWNER, biz);
    await expect(
      as(db, OWNER, () =>
        db.query(
          `update public.properties set is_public = true where id = $1`,
          [id],
        ),
      ),
    ).rejects.toThrow(/needs a seller declaration/);
    await as(db, OWNER, () =>
      db.query(
        `update public.properties set is_public = true, seller_capacity = 'owner' where id = $1`,
        [id],
      ),
    );
    expect((await read(id)).is_public).toBe(true);
  });

  it("needs a licence number from a broker, an agent and a developer, not from an owner", async () => {
    for (const capacity of ["broker", "agent", "developer"]) {
      await expect(
        list(OWNER, biz, { seller_capacity: capacity }),
      ).rejects.toThrow(/properties_seller_license_check/);
      await expect(
        list(OWNER, biz, { seller_capacity: capacity, seller_license: "  " }),
      ).rejects.toThrow(/properties_seller_license_check/);
    }
    await expect(
      list(OWNER, biz, { seller_capacity: "friend" }),
    ).rejects.toThrow(/properties_seller_capacity_check/);
    const id = await list(OWNER, biz, {
      seller_capacity: "broker",
      seller_license: "PRC 0012345",
    });
    expect((await read(id)).seller_license).toBe("PRC 0012345");
  });

  it("becomes the declaration of whoever changes it, and can't be taken back", async () => {
    const id = await list(OWNER, biz, { seller_capacity: "owner" });
    await db.query(
      `update public.properties set assigned_agent_id = $1 where id = $2`,
      [AGENT, id],
    );
    await as(db, AGENT, () =>
      db.query(
        `update public.properties set name = 'Renamed (test)' where id = $1`,
        [id],
      ),
    );
    expect((await read(id)).declared_by).toBe(OWNER);
    await as(db, AGENT, () =>
      db.query(
        `update public.properties set seller_capacity = 'agent', seller_license = 'PRC 0054321' where id = $1`,
        [id],
      ),
    );
    expect((await read(id)).declared_by).toBe(AGENT);
    await expect(
      as(db, OWNER, () =>
        db.query(
          `update public.properties set seller_capacity = null, seller_license = null where id = $1`,
          [id],
        ),
      ),
    ).rejects.toThrow(/cannot be removed/);
  });

  it("leaves listings from before the rule public and editable", async () => {
    const id = (
      await db.query<{ id: string }>(
        `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public) values ($1, 'Old (test)', 'lot', 'Pototan', 100000000, $2, true) returning id`,
        [biz, OWNER],
      )
    ).rows[0]!.id;
    await as(db, OWNER, () =>
      db.query(
        `update public.properties set status = 'reserved' where id = $1`,
        [id],
      ),
    );
    const row = await read(id);
    expect([row.is_public, row.seller_capacity]).toEqual([true, null]);
  });
});

describe("reports", () => {
  let listing: string;
  beforeAll(async () => {
    listing = await list(OWNER, biz, {
      is_public: true,
      seller_capacity: "owner",
    });
  });

  it("are filed only by the server, and only on a listing with a public page", async () => {
    await expect(
      as(db, OTHER, () => report(listing, "visitor", "not_real")),
    ).rejects.toThrow(/permission denied/);
    const hidden = await list(OWNER, biz);
    await expect(report(hidden, "visitor", "not_real")).rejects.toThrow(
      /not available/,
    );
    await expect(report(listing, "visitor", "auto_price")).rejects.toThrow(
      /listing_reports/,
    );
    await expect(report(listing, "visitor", "nonsense")).rejects.toThrow(
      /listing_reports/,
    );
    expect(
      await report(
        listing,
        "visitor",
        "pay_first",
        "Asked for GCash before a viewing",
        "0917 000 0000",
      ),
    ).toBeTruthy();
  });

  it("are read by the app admin only: not the seller, their team or anyone else", async () => {
    expect(await count(ADMIN, "listing_reports")).toBe(1);
    for (const who of [OWNER, AGENT, OTHER])
      expect(await count(who, "listing_reports")).toBe(0);
    await as(db, OWNER, () => db.query(`delete from public.listing_reports`));
    await as(db, OWNER, () =>
      db.query(
        `update public.listing_reports set status = 'dismissed', reporter_contact = null`,
      ),
    );
    expect(
      (
        await db.query(
          `select 1 from public.listing_reports where status = 'open'`,
        )
      ).rows.length,
    ).toBe(1);
    await expect(
      as(db, OWNER, () =>
        db.query(
          `insert into public.listing_reports (property_id, business_id, source, reason) values ($1, $2, 'visitor', 'other')`,
          [listing, biz],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("from the app's own checks don't pile up, and a dismissed finding isn't filed again unless it changes", async () => {
    const hidden = await list(OWNER, biz);
    const first = await report(
      hidden,
      "auto",
      "auto_price",
      "₱1 is far under similar listings",
    );
    expect(first).toBeTruthy();
    expect(
      await report(
        hidden,
        "auto",
        "auto_price",
        "₱2 is far under similar listings",
      ),
    ).toBeNull();
    await db.query(
      `select public.admin_dismiss_report($1, 'Checked: a small lot', $2)`,
      [first, ADMIN],
    );
    expect(
      await report(
        hidden,
        "auto",
        "auto_price",
        "₱1 is far under similar listings",
      ),
    ).toBeNull();
    expect(
      await report(
        hidden,
        "auto",
        "auto_price",
        "₱0.50 is far under similar listings",
      ),
    ).toBeTruthy();
    expect(
      await report(hidden, "auto", "auto_wording", "pay before viewing"),
    ).toBeTruthy();
  });

  it("stop at twenty waiting on one listing", async () => {
    const busy = await list(OWNER, biz, {
      is_public: true,
      seller_capacity: "owner",
    });
    for (let i = 0; i < 20; i++)
      expect(
        await report(busy, "visitor", "other", `Report ${i}`),
      ).toBeTruthy();
    expect(await report(busy, "visitor", "other", "One more")).toBeNull();
  });
});

describe("what the app admin does about a report", () => {
  it("runs only on the server and only for a super admin", async () => {
    const id = await list(OWNER, biz, {
      is_public: true,
      seller_capacity: "owner",
    });
    const rid = await report(id, "visitor", "not_real");
    for (const sql of [
      `select public.admin_take_down_listing('${id}', 'Fake', '${ADMIN}')`,
      `select public.admin_restore_listing('${id}', '${ADMIN}')`,
      `select public.admin_dismiss_report('${rid}', null, '${ADMIN}')`,
      `select public.admin_set_verified('${biz}', true, 'Checked', '${ADMIN}')`,
    ]) {
      await expect(as(db, ADMIN, () => db.query(sql))).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query(sql.replaceAll(ADMIN, OWNER))).rejects.toThrow(
        /only a super admin/,
      );
    }
    expect((await read(id)).is_public).toBe(true);
  });

  it("dismissing closes the report, erases the reporter's contact and leaves the listing up", async () => {
    const id = await list(OWNER, biz, {
      is_public: true,
      seller_capacity: "owner",
    });
    const rid = await report(
      id,
      "visitor",
      "misleading",
      "Photos look copied",
      "reporter@example.test",
    );
    await db.query(
      `select public.admin_dismiss_report($1, 'Photos are theirs', $2)`,
      [rid, ADMIN],
    );
    const r = (
      await db.query<{
        status: string;
        reporter_contact: string | null;
        resolved_by: string;
      }>(
        `select status, reporter_contact, resolved_by from public.listing_reports where id = $1`,
        [rid],
      )
    ).rows[0]!;
    expect(r).toEqual({
      status: "dismissed",
      reporter_contact: null,
      resolved_by: ADMIN,
    });
    expect((await read(id)).is_public).toBe(true);
    await expect(
      db.query(`select public.admin_dismiss_report($1, null, $2)`, [
        rid,
        ADMIN,
      ]),
    ).rejects.toThrow(/report not found/);
  });

  it("taking a listing down needs a reason, hides the page, closes its reports, and the seller can't undo it", async () => {
    const id = await list(OWNER, biz, {
      is_public: true,
      seller_capacity: "owner",
    });
    await report(id, "visitor", "not_real", null, "0917 111 1111");
    await report(id, "visitor", "pay_first");
    await expect(
      db.query(`select public.admin_take_down_listing($1, '  ', $2)`, [
        id,
        ADMIN,
      ]),
    ).rejects.toThrow(/say why/);
    await db.query(
      `select public.admin_take_down_listing($1, 'The owner on the title did not list this property', $2)`,
      [id, ADMIN],
    );

    const row = await read(id);
    expect(row.is_public).toBe(false);
    expect(row.taken_down_at).toBeTruthy();
    const reports = (
      await db.query<{ status: string; reporter_contact: string | null }>(
        `select status, reporter_contact from public.listing_reports where property_id = $1`,
        [id],
      )
    ).rows;
    expect(reports).toEqual([
      { status: "taken_down", reporter_contact: null },
      { status: "taken_down", reporter_contact: null },
    ]);

    // The form asks for a public page again: it stays down, and the rest of the edit is saved.
    await as(db, OWNER, () =>
      db.query(
        `update public.properties set is_public = true, name = 'Edited (test)' where id = $1`,
        [id],
      ),
    );
    expect((await read(id)).is_public).toBe(false);
    await expect(
      as(db, OWNER, () =>
        db.query(
          `update public.properties set taken_down_at = null, taken_down_reason = null where id = $1`,
          [id],
        ),
      ),
    ).rejects.toThrow(/only MyHomeSeller/);
    await expect(
      db.query(`update public.properties set is_public = true where id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/properties_taken_down_check/);

    await db.query(`select public.admin_restore_listing($1, $2)`, [id, ADMIN]);
    const back = await read(id);
    expect([back.is_public, back.taken_down_at]).toEqual([true, null]);
    await expect(
      db.query(`select public.admin_restore_listing($1, $2)`, [id, ADMIN]),
    ).rejects.toThrow(/listing not found/);
  });

  it("a new listing can't be made already taken down", async () => {
    const id = await list(OWNER, biz, {
      taken_down_at: "2026-01-01",
      taken_down_reason: "x",
    });
    expect((await read(id)).taken_down_at).toBeNull();
  });
});

describe("verified sellers", () => {
  it("are marked by the app admin with a note, which only the app admin reads", async () => {
    await expect(
      db.query(`select public.admin_set_verified($1, true, '', $2)`, [
        biz,
        ADMIN,
      ]),
    ).rejects.toThrow(/note what you checked/);
    await db.query(
      `select public.admin_set_verified($1, true, 'PRC ID and licence checked on a video call', $2)`,
      [biz, ADMIN],
    );
    expect(await count(ADMIN, "seller_verifications")).toBe(1);
    for (const who of [OWNER, AGENT, OTHER])
      expect(await count(who, "seller_verifications")).toBe(0);
    // The note isn't in the business's own audit log either.
    expect(
      await as(db, OWNER, () =>
        db.query(
          `select 1 from public.audit_logs where action like 'admin.seller.%'`,
        ),
      ).then((r) => r.rows.length),
    ).toBe(0);
  });

  it("can't be marked by the seller", async () => {
    await expect(
      as(db, OTHER, () =>
        db.query(
          `insert into public.seller_verifications (business_id) values ($1)`,
          [otherBiz],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await as(db, OWNER, () =>
      db.query(`delete from public.seller_verifications`),
    );
    expect(
      (await db.query(`select 1 from public.seller_verifications`)).rows.length,
    ).toBe(1);
  });

  it("show in the Accounts list, and the mark can be taken away", async () => {
    const businesses = async () =>
      (
        await db.query<{
          businesses: Array<{
            id: string;
            verified_at: string | null;
            verified_note: string | null;
          }>;
        }>(
          `select businesses from public.admin_accounts($1) where user_id = $2`,
          [ADMIN, OWNER],
        )
      ).rows[0]!.businesses.find((b) => b.id === biz)!;
    expect((await businesses()).verified_note).toBe(
      "PRC ID and licence checked on a video call",
    );
    await db.query(`select public.admin_set_verified($1, false, null, $2)`, [
      biz,
      ADMIN,
    ]);
    expect((await businesses()).verified_at).toBeNull();
  });
});

describe("photo fingerprints", () => {
  it("are sixteen hex characters or nothing", async () => {
    const id = await list(OWNER, biz, { seller_capacity: "owner" });
    const add = (hash: string | null) =>
      db.query(
        `insert into public.property_media (business_id, property_id, storage_path, kind, photo_hash) values ($1, $2, $3, 'photo', $4)`,
        [biz, id, `${biz}/${id}/${crypto.randomUUID()}.jpg`, hash],
      );
    await add(null);
    await add("0f1e2d3c4b5a6978");
    await expect(add("not-a-hash")).rejects.toThrow(/photo_hash/);
  });
});
