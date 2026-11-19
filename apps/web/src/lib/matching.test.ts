import { describe, expect, it } from "vitest";
import { areaMatch, describeSearch, manilaMonthStart, rankMatches, scoreMatch, type MatchListing } from "./matching";
import type { Facts } from "./qualification";

const facts = (f: Partial<Facts>): Facts => ({
  budget_min_minor: null,
  budget_max_minor: null,
  areas: [],
  property_types: [],
  timeline: null,
  financing: null,
  ...f,
});
const house: MatchListing = { type: "house_and_lot", location: "Kapitolyo, Pasig City", price_minor: 800_000_000, financing: { pagIbig: true } };

describe("areaMatch", () => {
  it("matches whole words and ignores 'City'", () => {
    expect(areaMatch("Kapitolyo, Pasig City", ["Pasig"])).toBe("Pasig");
    expect(areaMatch("Diliman, Quezon City", ["quezon city"])).toBe("quezon city");
    expect(areaMatch("BGC, Taguig", ["Makati", "BGC"])).toBe("BGC");
  });
  it("doesn't match part of a word", () => {
    expect(areaMatch("Pasay", ["Pasig"])).toBeNull();
    expect(areaMatch("San Pedro, Laguna", ["Pedro Gil"])).toBeNull();
  });
});

describe("scoreMatch", () => {
  it("scores a full match at 100 with reasons", () => {
    const m = scoreMatch(house, facts({ property_types: ["house_and_lot"], budget_max_minor: 900_000_000, areas: ["Pasig"], financing: "pagibig" }));
    expect(m?.score).toBe(100);
    expect(m?.fits).toEqual(["House and lot", "Within budget (up to ₱9,000,000)", "In Pasig", "Pag-IBIG accepted"]);
    expect(m?.gaps).toEqual([]);
  });

  it("needs at least two of type, budget and area", () => {
    expect(scoreMatch(house, facts({ budget_max_minor: 900_000_000 }))).toBeNull();
    expect(scoreMatch(house, facts({ budget_max_minor: 900_000_000, areas: ["Pasig"] }))).not.toBeNull();
  });

  it("filters out the wrong type, area or a price far over budget", () => {
    const base = { property_types: ["house_and_lot"], budget_max_minor: 900_000_000, areas: ["Pasig"] };
    expect(scoreMatch(house, facts({ ...base, property_types: ["condominium"] }))).toBeNull();
    expect(scoreMatch(house, facts({ ...base, areas: ["Cebu"] }))).toBeNull();
    expect(scoreMatch(house, facts({ ...base, budget_max_minor: 700_000_000 }))).toBeNull();
  });

  it("keeps a listing a little over budget, marked as a gap", () => {
    const m = scoreMatch(house, facts({ property_types: ["house_and_lot"], budget_max_minor: 750_000_000, areas: ["Pasig"] }));
    expect(m?.gaps).toEqual(["7% over their budget of ₱7,500,000"]);
    expect(m!.score).toBeLessThan(100);
  });

  it("notes financing the listing doesn't offer", () => {
    const m = scoreMatch(house, facts({ property_types: ["house_and_lot"], areas: ["Pasig"], financing: "in_house" }));
    expect(m?.gaps).toContain("In-house financing not listed");
    expect(m?.gaps).toContain("Budget not known");
  });
});

describe("rankMatches", () => {
  it("drops non-matches and puts the best first", () => {
    const f = facts({ property_types: ["house_and_lot"], budget_max_minor: 900_000_000, areas: ["Pasig"] });
    const listings = [
      { ...house, location: "Cebu" },
      { ...house, price_minor: 950_000_000 },
      house,
    ];
    const ranked = rankMatches(listings, (l) => scoreMatch(l, f), 5);
    expect(ranked.map((r) => r.item.price_minor)).toEqual([800_000_000, 950_000_000]);
  });
});

describe("describeSearch", () => {
  it("summarises without identifying anyone", () => {
    expect(
      describeSearch(facts({ property_types: ["condominium", "townhouse"], areas: ["BGC"], budget_min_minor: 400_000_000, budget_max_minor: 600_000_000, financing: "bank", timeline: "1_3_months" })),
    ).toEqual(["Condominium or Townhouse", "BGC", "₱4,000,000 to ₱6,000,000", "Bank loan", "In 1 to 3 months"]);
  });
});

describe("manilaMonthStart", () => {
  it("uses the Manila calendar month", () => {
    expect(manilaMonthStart(new Date("2026-11-30T17:00:00Z"))).toBe("2026-11-30T16:00:00.000Z"); // 1 Dec, 1 AM Manila
    expect(manilaMonthStart(new Date("2026-11-19T08:00:00Z"))).toBe("2026-10-31T16:00:00.000Z");
  });
});
