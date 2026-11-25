import { describe, expect, it } from "vitest";
import { isPhotoPath, oldPhotoUrl, photoFiles } from "./photo-copy";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const c = "33333333-3333-4333-8333-333333333333";

describe("photo copy", () => {
  it("accepts only the shapes the app writes", () => {
    expect(isPhotoPath("property-media", `${a}/${b}/${c}.jpg`)).toBe(true);
    expect(isPhotoPath("property-media", `${a}/${b}/${c}-thumb.jpg`)).toBe(
      true,
    );
    expect(isPhotoPath("avatars", `${a}/${b}.jpg`)).toBe(true);
    expect(isPhotoPath("property-media", `${a}/../${c}.jpg`)).toBe(false);
    expect(isPhotoPath("property-media", `${a}/${b}/${c}.jpg?x=1`)).toBe(false);
    expect(isPhotoPath("avatars", `${a}/${b}/${c}.jpg`)).toBe(false);
    expect(isPhotoPath("avatars", `${a}/${b}.png`)).toBe(false);
  });

  it("builds the old public address on the fixed host only", () => {
    expect(oldPhotoUrl({ bucket: "avatars", path: `${a}/${b}.jpg` })).toBe(
      `https://vesbaioyzzzpabcwhiyk.supabase.co/storage/v1/object/public/avatars/${a}/${b}.jpg`,
    );
    expect(() =>
      oldPhotoUrl({ bucket: "avatars", path: "//evil.example/x.jpg" }),
    ).toThrow();
  });

  it("lists each referenced photo once and counts bad paths", () => {
    const { files, rejected } = photoFiles(
      [
        {
          storage_path: `${a}/${b}/${c}.jpg`,
          thumb_path: `${a}/${b}/${c}-thumb.jpg`,
        },
        { storage_path: `${a}/${b}/${c}.jpg`, thumb_path: null },
        { storage_path: "bad/path.jpg", thumb_path: null },
      ],
      [{ avatar_path: `${a}/${b}.jpg` }, { avatar_path: null }],
    );
    expect(files).toHaveLength(3);
    expect(rejected).toBe(1);
  });
});
