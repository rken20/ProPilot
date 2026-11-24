import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/listing-seo";
import { publicListingIds } from "@/lib/public-listing";
import { siteOrigin } from "@/lib/site";

// Listings come and go, so the sitemap is built fresh, at most once an hour.
export const revalidate = 3600;

/** The public pages and every listing that has a public page, for search engines. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!origin) return [];
  return sitemapEntries(origin, await publicListingIds());
}
