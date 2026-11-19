/**
 * The property matcher: one engine for both directions (buyers for a listing,
 * listings for a buyer). Rule-based, so it's free to run and every match comes
 * with plain reasons. Type, budget and area are hard filters when the buyer
 * gave them; unknown facts earn fewer points so fuller matches rank first.
 */
import { formatPeso } from "./money";
import { TYPE_LABEL } from "./property-labels";
import { FINANCING, TIMELINES, type Facts } from "./qualification";

export type MatchListing = {
  type: string;
  location: string;
  price_minor: number;
  financing: { bankFinancing?: unknown; pagIbig?: unknown; inHouse?: unknown } | null;
};

export type Match = { score: number; fits: string[]; gaps: string[] };

/** Listings this far over the buyer's top budget still show, marked as over. */
export const OVER_BUDGET_SLACK = 0.1;

const FINANCING_FLAG = { bank: "bankFinancing", pagibig: "pagIbig", in_house: "inHouse" } as const;

/** Lowercase words only, without "city" / "city of", padded for whole-word search. */
function words(s: string): string {
  const w = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(city of|city)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return w ? ` ${w} ` : "";
}

/** The buyer area this listing is in, if any ("Pasig" matches "Kapitolyo, Pasig City"). */
export function areaMatch(location: string, areas: string[]): string | null {
  const loc = words(location);
  for (const a of areas) {
    const w = words(a);
    if (w && loc.includes(w)) return a;
  }
  return null;
}

/**
 * How well a listing fits what a buyer wants, or null when it doesn't fit or
 * the buyer hasn't said enough (at least two of type, budget and area).
 */
export function scoreMatch(listing: MatchListing, f: Facts): Match | null {
  const hasType = f.property_types.length > 0;
  const hasBudget = f.budget_max_minor !== null;
  const hasArea = f.areas.length > 0;
  if (Number(hasType) + Number(hasBudget) + Number(hasArea) < 2) return null;

  const fits: string[] = [];
  const gaps: string[] = [];
  let score = 0;

  if (hasType) {
    if (!f.property_types.includes(listing.type)) return null;
    score += 25;
    fits.push(TYPE_LABEL[listing.type as keyof typeof TYPE_LABEL] ?? "Right type");
  } else {
    score += 10;
  }

  if (hasBudget) {
    const max = f.budget_max_minor!;
    if (listing.price_minor <= max) {
      score += 35;
      fits.push(`Within budget (up to ${formatPeso(max)})`);
    } else if (listing.price_minor <= max * (1 + OVER_BUDGET_SLACK)) {
      score += 15;
      gaps.push(`${Math.ceil(((listing.price_minor - max) / max) * 100)}% over their budget of ${formatPeso(max)}`);
    } else {
      return null;
    }
  } else {
    score += 10;
    gaps.push("Budget not known");
  }

  if (hasArea) {
    const hit = areaMatch(listing.location, f.areas);
    if (!hit) return null;
    score += 30;
    fits.push(`In ${hit}`);
  } else {
    score += 10;
    gaps.push("Preferred area not known");
  }

  const flag = f.financing && f.financing in FINANCING_FLAG ? FINANCING_FLAG[f.financing as keyof typeof FINANCING_FLAG] : null;
  if (flag) {
    if (listing.financing?.[flag]) {
      score += 10;
      fits.push(`${FINANCING[f.financing!]} accepted`);
    } else {
      gaps.push(`${FINANCING[f.financing!]} not listed`);
    }
  } else {
    score += 5;
  }

  return { score, fits, gaps };
}

/** Best matches first, at most `limit`. */
export function rankMatches<T>(items: T[], score: (item: T) => Match | null, limit: number): Array<{ item: T; match: Match }> {
  const out: Array<{ item: T; match: Match }> = [];
  for (const item of items) {
    const match = score(item);
    if (match) out.push({ item, match });
  }
  return out.sort((a, b) => b.match.score - a.match.score).slice(0, limit);
}

/** A buyer's search without anything that identifies them, for Buyer Finder cards. */
export function describeSearch(f: Facts): string[] {
  const parts: string[] = [];
  if (f.property_types.length) parts.push(f.property_types.map((t) => TYPE_LABEL[t as keyof typeof TYPE_LABEL] ?? t).join(" or "));
  if (f.areas.length) parts.push(f.areas.join(", "));
  if (f.budget_max_minor !== null) {
    parts.push(f.budget_min_minor ? `${formatPeso(f.budget_min_minor)} to ${formatPeso(f.budget_max_minor)}` : `Up to ${formatPeso(f.budget_max_minor)}`);
  }
  if (f.financing && f.financing !== "unsure") parts.push(FINANCING[f.financing]);
  if (f.timeline) parts.push(TIMELINES[f.timeline]);
  return parts;
}

/** The first-of-month in Manila for `now`, as an ISO instant (Buyer Finder's monthly limit resets then). */
export function manilaMonthStart(now = new Date()): string {
  const m = new Date(now.getTime() + 8 * 3_600_000);
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1) - 8 * 3_600_000).toISOString();
}
