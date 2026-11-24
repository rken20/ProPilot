import { describe, expect, it } from "vitest";
import { siteOrigin } from "./site";

describe("the address search engines should use", () => {
  it("is SITE_URL when set, without a trailing slash", () => {
    expect(siteOrigin({ SITE_URL: "https://myhomeseller.example/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://myhomeseller.example");
  });

  it("is otherwise the project's production domain on Vercel, not the branch address", () => {
    expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "pro-pilot-nu.vercel.app", APP_ORIGIN: "https://pro-pilot-git-main-pro-pilot1.vercel.app" })).toBe("https://pro-pilot-nu.vercel.app");
  });

  it("falls back to APP_ORIGIN, and to nothing on a computer with none set", () => {
    expect(siteOrigin({ APP_ORIGIN: "https://example.test/" })).toBe("https://example.test");
    expect(siteOrigin({})).toBeNull();
  });

  it("ignores values that aren't a plain address", () => {
    expect(siteOrigin({ SITE_URL: "javascript:alert(1)", VERCEL_PROJECT_PRODUCTION_URL: "bad host/../x" })).toBeNull();
    expect(siteOrigin({ SITE_URL: "https://a.example/path", APP_ORIGIN: "https://b.example" })).toBe("https://b.example");
  });
});
