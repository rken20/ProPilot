import { describe, expect, it } from "vitest";
import { cleanReported, queryKey, sourceFor } from "./external-listings";

describe("sourceFor", () => {
  it("accepts allowed sites and their subdomains over https", () => {
    expect(sourceFor("https://www.lamudi.com.ph/property/abc#photos")).toEqual({
      url: "https://www.lamudi.com.ph/property/abc",
      name: "Lamudi",
    });
    expect(sourceFor("https://dotproperty.com.ph/x")?.name).toBe("Dot Property");
  });

  it("rejects other sites, look-alikes, http and odd URLs", () => {
    for (const bad of [
      "https://facebook.com/marketplace/item/1",
      "https://lamudi.com.ph.evil.example/x",
      "https://evil-lamudi.com.ph/x",
      "http://www.lamudi.com.ph/x",
      "https://user:pw@www.lamudi.com.ph/x",
      "https://www.lamudi.com.ph:8443/x",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(sourceFor(bad), bad).toBeNull();
    }
  });
});

describe("queryKey", () => {
  it("treats case, spacing and punctuation the same", () => {
    expect(queryKey({ q: "  Mandaluyong,  City ", type: "condominium", maxPriceMinor: 600000000 })).toBe(
      queryKey({ q: "mandaluyong city", type: "condominium", maxPriceMinor: 600000000 }),
    );
  });
});

describe("cleanReported", () => {
  const searched = new Set(["https://www.lamudi.com.ph/property/1", "https://www.dotproperty.com.ph/ads/2"]);

  it("keeps listings whose links came back from the search", () => {
    const out = cleanReported(
      {
        listings: [
          { url: "https://www.lamudi.com.ph/property/1", title: " 2BR  condo\n", price_php: 4800000, type: "condominium", bedrooms: 2 },
          { url: "https://www.dotproperty.com.ph/ads/2", title: "Lot", type: "castle", price_php: -5 },
        ],
      },
      searched,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: "2BR condo", price_minor: 480000000, source_name: "Lamudi", bedrooms: 2 });
    // Bad optional fields are dropped, not fatal.
    expect(out[1]).toMatchObject({ title: "Lot", type: null, price_minor: null });
  });

  it("drops invented links, other sites and duplicates", () => {
    const out = cleanReported(
      {
        listings: [
          { url: "https://www.lamudi.com.ph/property/999", title: "Made up" },
          { url: "https://evil.example/x", title: "Phish" },
          { url: "https://www.lamudi.com.ph/property/1", title: "A" },
          { url: "https://www.lamudi.com.ph/property/1#x", title: "A again" },
        ],
      },
      searched,
    );
    expect(out.map((l) => l.title)).toEqual(["A"]);
  });

  it("returns nothing for malformed input", () => {
    expect(cleanReported(null, searched)).toEqual([]);
    expect(cleanReported({ listings: "x" }, searched)).toEqual([]);
  });
});
