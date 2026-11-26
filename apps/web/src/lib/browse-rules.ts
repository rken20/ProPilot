/**
 * The public Properties page: which listings show, and in what order. Pure, so
 * the page and the tests share one set of rules.
 */
import { PROPERTY_TYPES } from "@propilot/shared";
import { planRank } from "./match-alert-rules";
import { TYPE_LABEL } from "./property-labels";

export const BROWSE_PATH = "/properties";
export const PAGE_SIZE = 24;

/** "featured" is the default: listings from sellers on paid plans come first. */
export const BROWSE_SORTS = [
  "featured",
  "newest",
  "price_low",
  "price_high",
] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type BrowseQuery = {
  q: string;
  type: PropertyType | null;
  sort: BrowseSort;
  page: number;
};

export type BrowseRow = {
  id: string;
  business_id: string;
  name: string;
  type: string;
  location: string;
  price_minor: number;
  status: "available" | "reserved";
  created_at: string | null;
};

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads the page's address. Anything unexpected falls back to the default. */
export function parseBrowse(
  params: Record<string, string | string[] | undefined>,
): BrowseQuery {
  const q = one(params.q).replace(/\s+/g, " ").trim().slice(0, 60);
  const type = one(params.type);
  const sort = one(params.sort);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q,
    type: (PROPERTY_TYPES as readonly string[]).includes(type)
      ? (type as PropertyType)
      : null,
    sort: (BROWSE_SORTS as readonly string[]).includes(sort)
      ? (sort as BrowseSort)
      : "featured",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 500) : 1,
  };
}

/** The address for a search, leaving out whatever is at its default. */
export function browseHref(
  query: BrowseQuery,
  change: Partial<BrowseQuery> = {},
): string {
  const next = { ...query, ...change };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.type) p.set("type", next.type);
  if (next.sort !== "featured") p.set("sort", next.sort);
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `${BROWSE_PATH}?${s}` : BROWSE_PATH;
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Keeps the listings of the chosen type whose name, place or type has every word searched for. */
export function filterBrowse<T extends BrowseRow>(
  rows: T[],
  query: Pick<BrowseQuery, "q" | "type">,
): T[] {
  const words = fold(query.q).split(" ").filter(Boolean);
  return rows.filter((r) => {
    if (query.type && r.type !== query.type) return false;
    if (!words.length) return true;
    const text = fold(
      `${r.name} ${r.location} ${TYPE_LABEL[r.type as PropertyType] ?? ""}`,
    );
    return words.every((w) => text.includes(w));
  });
}

const newest = (a: BrowseRow, b: BrowseRow) =>
  (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
  a.id.localeCompare(b.id);

/**
 * Orders the listings. Featured: Agency sellers, then Pro, then Basic, then
 * Free; within a plan, available before reserved, then newest. The other
 * orders ignore the plan.
 */
export function sortBrowse<T extends BrowseRow>(
  rows: T[],
  sort: BrowseSort,
  planOf: (businessId: string) => string | undefined,
): T[] {
  const list = [...rows];
  if (sort === "newest") return list.sort(newest);
  if (sort === "price_low")
    return list.sort((a, b) => a.price_minor - b.price_minor || newest(a, b));
  if (sort === "price_high")
    return list.sort((a, b) => b.price_minor - a.price_minor || newest(a, b));
  const open = (r: BrowseRow) => (r.status === "available" ? 1 : 0);
  return list.sort(
    (a, b) =>
      planRank(planOf(b.business_id)) - planRank(planOf(a.business_id)) ||
      open(b) - open(a) ||
      newest(a, b),
  );
}

/** One page of `rows`, with the page number pulled back into range. */
export function pageOf<T>(
  rows: T[],
  page: number,
  size = PAGE_SIZE,
): { items: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(Math.max(1, page), pages);
  return {
    items: rows.slice((at - 1) * size, at * size),
    page: at,
    pages,
    total: rows.length,
  };
}
