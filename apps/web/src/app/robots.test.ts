import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("lets search engines read listings, keeps them out of the signed-in app, and points to the sitemap", () => {
    vi.stubEnv("SITE_URL", "https://myhomeseller.example");
    const r = robots();
    const rules = r.rules as { allow: string[]; disallow: string[] };
    expect(rules.allow).toContain("/l/");
    for (const p of ["/app/", "/admin/", "/api/"]) expect(rules.disallow).toContain(p);
    expect(rules.disallow.some((p) => "/l/".startsWith(p))).toBe(false);
    expect(r.sitemap).toBe("https://myhomeseller.example/sitemap.xml");
  });

  it("names no sitemap when the site's address isn't known", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("APP_ORIGIN", "");
    expect(robots().sitemap).toBeUndefined();
  });
});
