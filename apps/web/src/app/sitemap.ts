import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/listing-seo";
import { publicListingIds } from "@/lib/public-listing";
import { siteOrigin } from "@/lib/site";

// Built when a search engine asks, not during a deploy: the build can't read the
// listings (the first version shipped an empty list), and listings come and go.
export const dynamic = "force-dynamic";

/** The public pages and every listing that has a public page, for search engines. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!origin) return [];
  return sitemapEntries(origin, await publicListingIds());
}
