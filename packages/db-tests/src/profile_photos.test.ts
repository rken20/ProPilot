/**
 * Profile photos: each person manages only their own folder, and a profile can
 * only point at a photo in its own folder.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, freshDb } from "./harness";

const ANA = "00000000-0000-0000-0000-0000000002a1";
const BEN = "00000000-0000-0000-0000-0000000002b1";
const FILE = "0f0e0d0c-0b0a-4908-8706-050403020100";

let db: PGlite;

const upload = (user: string, path: string) => as(db, user, () => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [path]));
const setPath = (user: string, target: string, path: string | null) =>
  as(db, user, () => db.query(`update public.profiles set avatar_path = $2 where id = $1`, [target, path]));
const pathOf = async (id: string) => (await db.query<{ avatar_path: string | null }>(`select avatar_path from public.profiles where id = $1`, [id])).rows[0]!.avatar_path;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${ANA}', 'ana@example.test', '{"full_name":"Ana"}'),
    ('${BEN}', 'ben@example.test', '{"full_name":"Ben"}');`);
});

describe("profile photo files", () => {
  it("go only in your own folder", async () => {
    await upload(ANA, `${ANA}/${FILE}.jpg`);
    await expect(upload(ANA, `${BEN}/${FILE}.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(ANA, `${FILE}.jpg`)).rejects.toThrow(/row-level security/);
  });

  it("can't be deleted or renamed by someone else", async () => {
    await as(db, BEN, () => db.query(`delete from storage.objects where bucket_id = 'avatars'`));
    await as(db, BEN, () => db.query(`update storage.objects set name = $1 where bucket_id = 'avatars'`, [`${BEN}/${FILE}.jpg`]));
    const rows = await db.query<{ name: string }>(`select name from storage.objects where bucket_id = 'avatars'`);
    expect(rows.rows.map((r) => r.name)).toEqual([`${ANA}/${FILE}.jpg`]);
  });

  it("can be deleted by their owner", async () => {
    await as(db, ANA, () => db.query(`delete from storage.objects where bucket_id = 'avatars' and name = $1`, [`${ANA}/${FILE}.jpg`]));
    expect((await db.query(`select 1 from storage.objects where bucket_id = 'avatars'`)).rows).toHaveLength(0);
  });
});

describe("the profile's photo", () => {
  it("can point at a photo in your own folder, and be cleared", async () => {
    await setPath(ANA, ANA, `${ANA}/${FILE}.jpg`);
    expect(await pathOf(ANA)).toBe(`${ANA}/${FILE}.jpg`);
    await setPath(ANA, ANA, null);
    expect(await pathOf(ANA)).toBeNull();
  });

  it("can't point at someone else's photo or anything else", async () => {
    await expect(setPath(ANA, ANA, `${BEN}/${FILE}.jpg`)).rejects.toThrow(/profiles_avatar_path_own/);
    await expect(setPath(ANA, ANA, `${ANA}/../${BEN}/${FILE}.jpg`)).rejects.toThrow(/profiles_avatar_path_own/);
    await expect(setPath(ANA, ANA, `https://example.test/me.jpg`)).rejects.toThrow(/profiles_avatar_path_own/);
  });

  it("can't be changed on someone else's profile", async () => {
    await setPath(BEN, ANA, `${ANA}/${FILE}.jpg`);
    expect(await pathOf(ANA)).toBeNull();
  });
});
