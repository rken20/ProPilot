import { describe, expect, it } from "vitest";
import { groupReports } from "./admin-reports";

const listing = (id: string) => ({
  id,
  name: `Listing ${id}`,
  location: "Pototan",
  price_minor: 1,
  currency: "PHP",
  live: true,
  seller: "Seller",
  verified: false,
  capacity: null,
  license: null,
});
const report = (id: string, at: string, l: string) => ({
  id,
  source: "visitor" as const,
  reason: "other",
  details: null,
  contact: null,
  created_at: at,
  listing: listing(l),
});

describe("groupReports", () => {
  it("puts reports under their listing, newest first", () => {
    const grouped = groupReports([
      report("r1", "2026-11-01", "a"),
      report("r2", "2026-11-03", "b"),
      report("r3", "2026-11-05", "a"),
    ]);
    expect(grouped.map((g) => [g.id, g.reports.map((r) => r.id)])).toEqual([
      ["a", ["r3", "r1"]],
      ["b", ["r2"]],
    ]);
  });

  it("is empty with no reports", () => {
    expect(groupReports([])).toEqual([]);
  });
});
