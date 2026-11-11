import { z } from "zod";
import { PROPERTY_TYPES } from "@propilot/shared";

/**
 * Listings found on other property sites. Pure helpers (no network), so the
 * rules that decide what gets stored can be tested on their own.
 */

/** Sites the search may use, and the name buyers see. Facebook is left out on purpose. */
export const SOURCES: Record<string, string> = {
  "lamudi.com.ph": "Lamudi",
  "dotproperty.com.ph": "Dot Property",
  "property24.com.ph": "Property24",
  "myproperty.ph": "MyProperty",
  "housal.com": "Housal",
};

export type ExternalListing = {
  id: string;
  source_url: string;
  source_name: string;
  title: string;
  type: (typeof PROPERTY_TYPES)[number] | null;
  location: string | null;
  price_minor: number | null;
  currency: string;
  bedrooms: number | null;
  floor_area_sqm: number | null;
  last_seen_at: string;
};

export type SearchFilters = { q: string; type: string; maxPriceMinor?: number };

/** Same search, same key, so repeats within a day come from the cache. */
export function queryKey({ q, type, maxPriceMinor }: SearchFilters): string {
  const area = q.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  return [area, type, maxPriceMinor ?? ""].join("|").slice(0, 200);
}

/** The site a URL belongs to, if it's one of SOURCES (subdomains allowed, https only). */
export function sourceFor(raw: string): { url: string; name: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  for (const [domain, name] of Object.entries(SOURCES)) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      u.hash = "";
      return { url: u.toString(), name };
    }
  }
  return null;
}

const text = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(max));

const reported = z.object({
  url: z.string().max(600),
  title: text(160),
  location: text(160).optional().catch(undefined),
  type: z.enum(PROPERTY_TYPES).optional().catch(undefined),
  price_php: z.number().positive().max(10_000_000_000).optional().catch(undefined),
  bedrooms: z.number().int().min(0).max(50).optional().catch(undefined),
  floor_area_sqm: z.number().positive().max(999_999).optional().catch(undefined),
});

export type CleanListing = {
  source_url: string;
  source_name: string;
  title: string;
  location: string | null;
  type: (typeof PROPERTY_TYPES)[number] | null;
  price_minor: number | null;
  bedrooms: number | null;
  floor_area_sqm: number | null;
};

/**
 * Turn what the model reported into rows we're willing to store. The model's
 * output is untrusted: a listing is kept only if its URL is on an allowed
 * site AND came back from the web search itself (so no invented links).
 */
export function cleanReported(input: unknown, searchedUrls: Set<string>, max = 12): CleanListing[] {
  const list = z.object({ listings: z.array(z.unknown()).max(40) }).safeParse(input);
  if (!list.success) return [];
  const seen = new Set<string>();
  const out: CleanListing[] = [];
  for (const item of list.data.listings) {
    const r = reported.safeParse(item);
    if (!r.success) continue;
    const src = sourceFor(r.data.url);
    if (!src || seen.has(src.url) || !searchedUrls.has(src.url)) continue;
    seen.add(src.url);
    out.push({
      source_url: src.url,
      source_name: src.name,
      title: r.data.title,
      location: r.data.location ?? null,
      type: r.data.type ?? null,
      price_minor: r.data.price_php ? Math.round(r.data.price_php * 100) : null,
      bedrooms: r.data.bedrooms ?? null,
      floor_area_sqm: r.data.floor_area_sqm ?? null,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Normalise a search result URL the same way sourceFor does, for matching. */
export function normaliseSearchedUrl(raw: string): string | null {
  return sourceFor(raw)?.url ?? null;
}
