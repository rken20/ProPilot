import { describe, expect, it } from "vitest";
import { fitWithin, mediaUrl, photoPaths } from "./media";

describe("photo helpers", () => {
  it("never enlarges and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 480)).toEqual({ width: 360, height: 480 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("stores photos under business/property folders", () => {
    expect(photoPaths("b1", "p1", "x")).toEqual({ full: "b1/p1/x.jpg", thumb: "b1/p1/x-thumb.jpg" });
  });

  it("builds public URLs from the Supabase project URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(mediaUrl("b1/p1/x.jpg")).toBe("https://abc.supabase.co/storage/v1/object/public/property-media/b1/p1/x.jpg");
    expect(mediaUrl(null)).toBeNull();
  });
});

describe("profile photo helpers", () => {
  it("stores a photo in the person's own folder and builds its public link", async () => {
    const { avatarPath, avatarUrl } = await import("./media");
    expect(avatarPath("u1", "f1")).toBe("u1/f1.jpg");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(avatarUrl("u1/f1.jpg")).toBe("https://abc.supabase.co/storage/v1/object/public/avatars/u1/f1.jpg");
    expect(avatarUrl(null)).toBeNull();
  });

  it("cuts a centred square, nearer the top on portrait photos", async () => {
    const { squareCrop } = await import("./media");
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, size: 3000 });
    expect(squareCrop(3000, 4500)).toEqual({ sx: 0, sy: 500, size: 3000 });
    expect(squareCrop(800, 800)).toEqual({ sx: 0, sy: 0, size: 800 });
  });
});
