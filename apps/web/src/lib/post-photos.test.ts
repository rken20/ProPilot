import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { downloadFacebookImage, toListingJpegs } = await import("./post-photos");

const png = () => sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#3a6" } }).png().toBuffer();

describe("downloadFacebookImage", () => {
  it("refuses hosts other than Facebook's without fetching", async () => {
    const f = vi.fn();
    expect(await downloadFacebookImage("https://169.254.169.254/latest/meta-data", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses non-images and oversized files", async () => {
    const html = vi.fn().mockResolvedValue(new Response("<html>", { headers: { "content-type": "text/html" } }));
    expect(await downloadFacebookImage("https://scontent.xx.fbcdn.net/a.jpg", html)).toBeNull();
    const big = vi.fn().mockResolvedValue(new Response("x", { headers: { "content-type": "image/jpeg", "content-length": "99999999" } }));
    expect(await downloadFacebookImage("https://scontent.xx.fbcdn.net/a.jpg", big)).toBeNull();
  });

  it("downloads an image and never follows redirects", async () => {
    const body = await png();
    const f = vi.fn().mockResolvedValue(new Response(new Uint8Array(body), { headers: { "content-type": "image/png" } }));
    const out = await downloadFacebookImage("https://scontent.xx.fbcdn.net/a.png", f);
    expect(out?.length).toBe(body.length);
    expect(f.mock.calls[0]![1].redirect).toBe("error");
  });
});

describe("toListingJpegs", () => {
  it("makes a 1600px JPEG and a 480px thumbnail", async () => {
    const out = await toListingJpegs(await png());
    expect(out.width).toBe(1600);
    expect(out.height).toBe(800);
    expect((await sharp(out.thumb).metadata()).width).toBe(480);
    expect((await sharp(out.full).metadata()).format).toBe("jpeg");
  });

  it("rejects something that isn't an image", async () => {
    await expect(toListingJpegs(Buffer.from("not an image"))).rejects.toThrow();
  });
});
