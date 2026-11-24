import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { listingDescription, listingJsonLd, listingTitle, sitemapEntries } from "./listing-seo";
import type { PublicListing } from "./public-listing";

const house: PublicListing = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "3BR House, Lanag",
  type: "house_and_lot",
  location: "Barangay Lanag, Pototan, Iloilo",
  price_minor: 250_000_000,
  reservation_fee_minor: 2_000_000,
  currency: "PHP",
  status: "available",
  description: "Three bedrooms, two bathrooms, a covered garage and a fenced garden. Ten minutes from the town plaza.\nClean title.",
  financing: { bankFinancing: true, pagIbig: true },
  business_name: "Santos Realty",
  photos: [{ id: "p1", path: "b/l/one.jpg", thumb: "b/l/one-t.jpg" }],
  created_at: "2026-11-20T02:00:00Z",
  updated_at: "2026-11-23T05:00:00Z",
};
const url = "https://myhomeseller.example/l/11111111-1111-4111-8111-111111111111";

describe("a listing's search title", () => {
  it("says what it is, that it's for sale, where, and the price", () => {
    expect(listingTitle(house)).toBe("3BR House, Lanag for sale in Barangay Lanag, Pototan, Iloilo · ₱2,500,000");
  });

  it("doesn't say for sale twice, and says when it's reserved", () => {
    expect(listingTitle({ ...house, name: "FOR SALE: 3BR House" })).toBe("FOR SALE: 3BR House in Barangay Lanag, Pototan, Iloilo · ₱2,500,000");
    expect(listingTitle({ ...house, status: "reserved" })).toBe("3BR House, Lanag in Barangay Lanag, Pototan, Iloilo · ₱2,500,000 (reserved)");
  });
});

describe("a listing's search description", () => {
  it("leads with type, place, price and financing, then the owner's own words, in about 160 characters", () => {
    const d = listingDescription(house);
    expect(d.startsWith("House and lot for sale in Barangay Lanag, Pototan, Iloilo for ₱2,500,000. Bank financing, Pag-IBIG. Three bedrooms")).toBe(true);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).not.toContain("\n");
    expect(d.endsWith("…")).toBe(true);
  });

  it("works without a description or financing", () => {
    expect(listingDescription({ ...house, description: null, financing: null })).toBe("House and lot for sale in Barangay Lanag, Pototan, Iloilo for ₱2,500,000. Listed by Santos Realty on MyHomeSeller.");
  });
});

describe("a listing's structured data", () => {
  const ld = listingJsonLd(house, url, ["https://cdn.example/one.jpg"]);

  it("describes the listing, the property and the offer", () => {
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: "3BR House, Lanag",
      url,
      datePosted: "2026-11-20",
      image: ["https://cdn.example/one.jpg"],
      about: { "@type": "SingleFamilyResidence", name: "3BR House, Lanag", address: "Barangay Lanag, Pototan, Iloilo, Philippines" },
      offers: { "@type": "Offer", price: 2500000, priceCurrency: "PHP", availability: "https://schema.org/InStock", url, seller: { "@type": "RealEstateAgent", name: "Santos Realty" } },
    });
  });

  it("marks a reserved listing as reserved, and leaves out photos it doesn't have", () => {
    const r = listingJsonLd({ ...house, status: "reserved", location: "Makati, Philippines" }, url, []);
    expect(r.offers.availability).toBe("https://schema.org/Reserved");
    expect(r.about.address).toBe("Makati, Philippines");
    expect("image" in r).toBe(false);
  });
});

describe("the sitemap", () => {
  it("lists the public pages and every public listing with when it last changed", () => {
    const entries = sitemapEntries("https://myhomeseller.example", [{ id: house.id, updated_at: house.updated_at }]);
    expect(entries.map((e) => e.url)).toEqual([
      "https://myhomeseller.example/",
      "https://myhomeseller.example/get-app",
      "https://myhomeseller.example/privacy",
      url,
    ]);
    expect(entries.at(-1)!.lastModified).toEqual(new Date("2026-11-23T05:00:00Z"));
  });
});
