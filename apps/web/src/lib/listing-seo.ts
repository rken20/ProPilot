import type { MetadataRoute } from "next";
import { formatPeso } from "./money";
import { TYPE_LABEL } from "./property-labels";
import type { PublicListing } from "./public-listing";

/**
 * What search engines read about a public listing: its title, its description
 * and its structured data. All of it comes from what the owner entered; nothing
 * is added or guessed.
 */

/** Same wording as the listing page (lib/listings is server-only, and this file is plain logic). */
function financingLabels(f: PublicListing["financing"]): string[] {
  if (!f) return [];
  return [f.bankFinancing && "Bank financing", f.pagIbig && "Pag-IBIG", f.inHouse && "In-house"].filter((x): x is string => Boolean(x));
}

const typeLabel = (l: PublicListing) => TYPE_LABEL[l.type as keyof typeof TYPE_LABEL] ?? "Property";

/** "3BR House, Lanag for sale in Pototan, Iloilo · ₱2,500,000" */
export function listingTitle(l: PublicListing): string {
  const price = formatPeso(l.price_minor, l.currency);
  const forSale = l.status === "available" && !/for\s+sale/i.test(l.name) ? " for sale" : "";
  return `${l.name}${forSale} in ${l.location} · ${price}${l.status === "reserved" ? " (reserved)" : ""}`;
}

/** One or two sentences for the search result, about 160 characters. */
export function listingDescription(l: PublicListing, max = 160): string {
  const lead = `${typeLabel(l)} ${l.status === "reserved" ? "(reserved)" : "for sale"} in ${l.location} for ${formatPeso(l.price_minor, l.currency)}.`;
  const fin = financingLabels(l.financing);
  const words = (l.description ?? "").replace(/\s+/g, " ").trim();
  const full = [lead, fin.length ? `${fin.join(", ")}.` : null, words || `Listed by ${l.business_name} on MyHomeSeller.`].filter(Boolean).join(" ");
  if (full.length <= max) return full;
  const cut = full.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[\s,.;:]+$/, "")}…`;
}

const ABOUT_TYPE: Record<string, string> = { condominium: "Apartment", house_and_lot: "SingleFamilyResidence", townhouse: "House" };

/** schema.org data for the listing page (RealEstateListing with the property and the offer). */
export function listingJsonLd(l: PublicListing, url: string, images: string[]) {
  const address = /philippines/i.test(l.location) ? l.location : `${l.location}, Philippines`;
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: l.name,
    url,
    description: listingDescription(l, 300),
    ...(l.created_at ? { datePosted: l.created_at.slice(0, 10) } : {}),
    ...(images.length ? { image: images.slice(0, 6) } : {}),
    about: { "@type": ABOUT_TYPE[l.type] ?? "Place", name: l.name, address },
    offers: {
      "@type": "Offer",
      price: Math.round(l.price_minor / 100),
      priceCurrency: l.currency,
      availability: l.status === "reserved" ? "https://schema.org/Reserved" : "https://schema.org/InStock",
      url,
      seller: { "@type": "RealEstateAgent", name: l.business_name },
    },
  };
}

/** JSON-LD as text for a script tag. "<" is escaped so listing text can never close the tag. */
export const jsonLdText = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** The sitemap: the public pages, then every public listing. */
export function sitemapEntries(origin: string, listings: Array<{ id: string; updated_at: string | null }>): MetadataRoute.Sitemap {
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/properties`, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/get-app`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${origin}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ...listings.map((l) => ({
      url: `${origin}/l/${l.id}`,
      ...(l.updated_at ? { lastModified: new Date(l.updated_at) } : {}),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
