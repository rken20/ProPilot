/**
 * Property photos: who can upload and delete files, path rules, the 20-photo
 * limit, and what buyers can see.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const OWNER_A = "00000000-0000-0000-0000-0000000001a1";
const AGENT_A = "00000000-0000-0000-0000-0000000001a2"; // agent role in A
const OWNER_B = "00000000-0000-0000-0000-0000000001b1";
const BUYER = "00000000-0000-0000-0000-0000000001f1";

let db: PGlite;
let bizA: string;
let bizB: string;
let pubProp: string;
let privProp: string;

async function addProperty(isPublic: boolean) {
  const { rows } = await as(db, OWNER_A, () =>
    db.query<{ id: string }>(
      `insert into public.properties (business_id, name, type, location, price_minor, created_by, is_public)
       values ($1, 'Photo test (test)', 'condominium', 'Iloilo', 100, $2, $3) returning id`,
      [bizA, OWNER_A, isPublic],
    ),
  );
  return rows[0]!.id;
}

const uploadAs = (user: string, path: string) =>
  as(db, user, () => db.query(`insert into storage.objects (bucket_id, name) values ('property-media', $1)`, [path]));

const addMedia = (user: string, property: string, path: string, order = 0) =>
  as(db, user, () =>
    db.query(
      `insert into public.property_media (business_id, property_id, storage_path, thumb_path, kind, sort_order)
       values ($1, $2, $3, $4, 'photo', $5)`,
      [bizA, property, path, path.replace(".jpg", "-thumb.jpg"), order],
    ),
  );

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${OWNER_A}', 'oa@example.test', '{}'), ('${AGENT_A}', 'aa@example.test', '{}'),
      ('${OWNER_B}', 'ob@example.test', '{}'), ('${BUYER}', 'buyer@example.test', '{"account_type":"buyer"}');
  `);
  bizA = await as(db, OWNER_A, async () => (await db.query<{ id: string }>(`select public.create_business('Photo Realty A (test)') as id`)).rows[0]!.id);
  bizB = await as(db, OWNER_B, async () => (await db.query<{ id: string }>(`select public.create_business('Photo Realty B (test)') as id`)).rows[0]!.id);
  await db.query(`insert into public.business_members (business_id, user_id, role) values ($1, $2, 'agent')`, [bizA, AGENT_A]);
  pubProp = await addProperty(true);
  privProp = await addProperty(false);
});

describe("storage bucket", () => {
  it("is created as a public, images-only bucket with a 5 MB limit", async () => {
    const { rows } = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'property-media'`,
    );
    expect(rows[0]?.public).toBe(true);
    expect(Number(rows[0]?.file_size_limit)).toBe(5 * 1024 * 1024);
    expect(rows[0]?.allowed_mime_types).toContain("image/jpeg");
  });
});

describe("uploading files", () => {
  it("lets an owner upload into their own business folder", async () => {
    await uploadAs(OWNER_A, `${bizA}/${pubProp}/a.jpg`);
  });

  it("blocks uploads into another business's folder", async () => {
    await expect(uploadAs(OWNER_B, `${bizA}/${pubProp}/sneaky.jpg`)).rejects.toThrow(/row-level security/);
  });

  it("blocks agents and malformed paths", async () => {
    await expect(uploadAs(AGENT_A, `${bizA}/${pubProp}/agent.jpg`)).rejects.toThrow(/row-level security/);
    await expect(uploadAs(OWNER_A, `not-a-uuid/${pubProp}/x.jpg`)).rejects.toThrow(/row-level security/);
  });

  it("stops another business from deleting the files", async () => {
    const res = await as(db, OWNER_B, () => db.query(`delete from storage.objects where bucket_id = 'property-media'`));
    expect(res.affectedRows).toBe(0);
  });
});

describe("photo records", () => {
  it("accepts a photo stored under the property's own folder", async () => {
    await addMedia(OWNER_A, pubProp, `${bizA}/${pubProp}/a.jpg`);
  });

  it("rejects a path that points at another property or business", async () => {
    await expect(addMedia(OWNER_A, pubProp, `${bizB}/${pubProp}/x.jpg`)).rejects.toThrow(/does not match/);
    await expect(addMedia(OWNER_A, pubProp, `${bizA}/${privProp}/x.jpg`)).rejects.toThrow(/does not match/);
  });

  it("caps a property at 20 photos", async () => {
    for (let i = 1; i < 20; i++) await addMedia(OWNER_A, pubProp, `${bizA}/${pubProp}/p${i}.jpg`, i);
    await expect(addMedia(OWNER_A, pubProp, `${bizA}/${pubProp}/p21.jpg`, 21)).rejects.toThrow(/at most 20/);
  });
});

describe("what buyers see", () => {
  beforeAll(async () => {
    await addMedia(OWNER_A, privProp, `${bizA}/${privProp}/hidden.jpg`);
  });

  it("returns photos of public listings in order, with a cover on search results", async () => {
    const media = await as(db, BUYER, () => db.query<{ storage_path: string }>(`select storage_path from public.get_listing_media($1)`, [pubProp]));
    expect(media.rows).toHaveLength(20);
    expect(media.rows[0]!.storage_path).toBe(`${bizA}/${pubProp}/a.jpg`);

    const search = await as(db, BUYER, () =>
      db.query<{ id: string; cover_thumb_path: string; photo_count: number }>(`select id, cover_thumb_path, photo_count from public.search_listings()`),
    );
    const row = search.rows.find((r) => r.id === pubProp)!;
    expect(row.cover_thumb_path).toBe(`${bizA}/${pubProp}/a-thumb.jpg`);
    expect(row.photo_count).toBe(20);
  });

  it("returns no photos for private listings", async () => {
    const media = await as(db, BUYER, () => db.query(`select * from public.get_listing_media($1)`, [privProp]));
    expect(media.rows).toHaveLength(0);
  });

  it("never lets buyers read the photo table directly", async () => {
    const { rows } = await as(db, BUYER, () => db.query(`select * from public.property_media`));
    expect(rows).toHaveLength(0);
  });
});
