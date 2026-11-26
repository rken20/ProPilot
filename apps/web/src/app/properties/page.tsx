import type { Metadata } from "next";
import { BROWSE_PATH, parseBrowse } from "@/lib/browse-rules";
import { env } from "@/lib/env";
import { siteLang } from "@/lib/lang-server";
import { browsePublicListings } from "@/lib/public-listing";
import { PropertiesView } from "./properties-view";

export const metadata: Metadata = {
  title: "Properties for Sale in the Philippines | MyHomeSeller",
  description:
    "Houses, condos, townhouses and lots listed by owners and agents on MyHomeSeller. See the price, photos and financing, then ask the seller directly.",
  // One address for search engines, whatever the search or page.
  alternates: { canonical: BROWSE_PATH },
  robots: { index: true, follow: true },
};

/** Every listing with a public page. Listings from sellers on paid plans come first unless the visitor picks another order. */
export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseBrowse(await searchParams);
  const [lang, found] = await Promise.all([
    siteLang(),
    browsePublicListings(query),
  ]);
  return (
    <PropertiesView
      query={query}
      found={found}
      lang={lang}
      configured={env.isConfigured()}
    />
  );
}
