import { describe, expect, it } from "vitest";
import {
  browseHref,
  filterBrowse,
  pageOf,
  parseBrowse,
  sortBrowse,
  type BrowseRow,
} from "./browse-rules";

const row = (id: string, over: Partial<BrowseRow> = {}): BrowseRow => ({
  id,
  business_id: "free-biz",
  name: `Listing ${id}`,
  type: "house_and_lot",
  location: "Pototan, Iloilo",
  price_minor: 250_000_000,
  status: "available",
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});
const plans: Record<string, string> = {
  "agency-biz": "agency",
  "pro-biz": "pro",
  "basic-biz": "basic",
};
const planOf = (b: string) => plans[b];
const ids = (rows: BrowseRow[]) => rows.map((r) => r.id);

describe("the public Properties page", () => {
  it("puts paid sellers first by default: Agency, Pro, Basic, then Free", () => {
    const rows = [
      row("free-new", { created_at: "2026-11-25T00:00:00Z" }),
      row("basic", { business_id: "basic-biz" }),
      row("agency", {
        business_id: "agency-biz",
        created_at: "2026-10-01T00:00:00Z",
      }),
      row("pro", { business_id: "pro-biz" }),
    ];
    expect(ids(sortBrowse(rows, "featured", planOf))).toEqual([
      "agency",
      "pro",
      "basic",
      "free-new",
    ]);
  });

  it("within a plan, shows available before reserved, then the newest", () => {
    const rows = [
      row("old", { created_at: "2026-10-01T00:00:00Z" }),
      row("reserved-new", {
        status: "reserved",
        created_at: "2026-11-20T00:00:00Z",
      }),
      row("new", { created_at: "2026-11-10T00:00:00Z" }),
    ];
    expect(ids(sortBrowse(rows, "featured", planOf))).toEqual([
      "new",
      "old",
      "reserved-new",
    ]);
  });

  it("treats a plan that has ended as Free", () => {
    // The page only passes plans whose period is still running, so an ended one is simply missing.
    const rows = [
      row("lapsed", {
        business_id: "lapsed-biz",
        created_at: "2026-11-02T00:00:00Z",
      }),
      row("free", { created_at: "2026-11-03T00:00:00Z" }),
    ];
    expect(ids(sortBrowse(rows, "featured", planOf))).toEqual([
      "free",
      "lapsed",
    ]);
  });

  it("ignores the plan when the visitor picks another order", () => {
    const rows = [
      row("agency-dear", {
        business_id: "agency-biz",
        price_minor: 900_000_000,
        created_at: "2026-10-01T00:00:00Z",
      }),
      row("free-cheap", {
        price_minor: 100_000_000,
        created_at: "2026-11-20T00:00:00Z",
      }),
    ];
    expect(ids(sortBrowse(rows, "price_low", planOf))).toEqual([
      "free-cheap",
      "agency-dear",
    ]);
    expect(ids(sortBrowse(rows, "price_high", planOf))).toEqual([
      "agency-dear",
      "free-cheap",
    ]);
    expect(ids(sortBrowse(rows, "newest", planOf))).toEqual([
      "free-cheap",
      "agency-dear",
    ]);
  });

  it("searches name, place and type, every word, ignoring case and accents", () => {
    const rows = [
      row("a", { name: "3BR House, Lanag", location: "Pototan, Iloilo" }),
      row("b", {
        name: "Studio near Ayala",
        type: "condominium",
        location: "Makati",
      }),
      row("c", { name: "Corner lot", type: "lot", location: "Parañaque" }),
    ];
    expect(ids(filterBrowse(rows, { q: "iloilo house", type: null }))).toEqual([
      "a",
    ]);
    expect(ids(filterBrowse(rows, { q: "CONDOMINIUM", type: null }))).toEqual([
      "b",
    ]);
    expect(ids(filterBrowse(rows, { q: "paranaque", type: null }))).toEqual([
      "c",
    ]);
    expect(ids(filterBrowse(rows, { q: "", type: "lot" }))).toEqual(["c"]);
    expect(ids(filterBrowse(rows, { q: "makati", type: "lot" }))).toEqual([]);
  });

  it("reads the address, falling back to the default for anything odd", () => {
    expect(parseBrowse({})).toEqual({
      q: "",
      type: null,
      sort: "featured",
      page: 1,
    });
    expect(
      parseBrowse({
        q: "  Iloilo   City ",
        type: "lot",
        sort: "price_low",
        page: "3",
      }),
    ).toEqual({ q: "Iloilo City", type: "lot", sort: "price_low", page: 3 });
    expect(
      parseBrowse({
        type: "castle",
        sort: "random",
        page: "-2",
        q: ["a", "b"],
      }),
    ).toEqual({ q: "a", type: null, sort: "featured", page: 1 });
    expect(parseBrowse({ q: "x".repeat(200) }).q).toHaveLength(60);
  });

  it("builds addresses without the defaults", () => {
    const q = parseBrowse({});
    expect(browseHref(q)).toBe("/properties");
    expect(browseHref(q, { page: 2 })).toBe("/properties?page=2");
    expect(
      browseHref({ q: "Iloilo City", type: "lot", sort: "newest", page: 1 }),
    ).toBe("/properties?q=Iloilo+City&type=lot&sort=newest");
  });

  it("pages the list and pulls a page number back into range", () => {
    const rows = Array.from({ length: 50 }, (_, i) => i);
    expect(pageOf(rows, 1).items).toHaveLength(24);
    expect(pageOf(rows, 3)).toMatchObject({ page: 3, pages: 3, total: 50 });
    expect(pageOf(rows, 3).items).toEqual([48, 49]);
    expect(pageOf(rows, 99).page).toBe(3);
    expect(pageOf([], 1)).toEqual({ items: [], page: 1, pages: 1, total: 0 });
  });
});
