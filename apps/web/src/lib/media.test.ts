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
