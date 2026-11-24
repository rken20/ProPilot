import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { mediaUrl } from "@/lib/media";
import { jsonLdText, listingDescription, listingJsonLd, listingTitle } from "@/lib/listing-seo";
import { getPublicListing, publicListingPath, recordListingView } from "@/lib/public-listing";
import { siteOrigin } from "@/lib/site";
import { sendInquiry } from "./actions";
import { matchAlertsOn } from "@/lib/match-alerts";
import { PublicListingView } from "./listing-view";

/** Search results and link previews (Google, Facebook, Messenger, SMS) show the listing's name, place, price and photo. */
export async function generateMetadata({ params }: PageProps<"/l/[id]">): Promise<Metadata> {
  const listing = await getPublicListing((await params).id);
  if (!listing) return { title: "Listing not available · MyHomeSeller", robots: { index: false } };
  const title = listingTitle(listing);
  const description = listingDescription(listing);
  const cover = listing.photos[0] ? mediaUrl(listing.photos[0].path) : null;
  const path = publicListingPath(listing.id);
  return {
    title: `${title} | MyHomeSeller`,
    description,
    // One address per listing, whichever address the visitor came in on.
    alternates: { canonical: path },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    openGraph: { title, description, type: "website", url: path, ...(cover ? { images: [{ url: cover, alt: listing.name }] } : {}) },
    twitter: { card: cover ? "summary_large_image" : "summary", title, description },
  };
}

export default async function PublicListingPage({ params }: PageProps<"/l/[id]">) {
  const { id } = await params;
  const listing = await getPublicListing(id);
  if (!listing) notFound();
  // Link-preview crawlers (Facebook, Messenger, search engines) aren't views.
  const ua = (await headers()).get("user-agent") ?? "";
  if (!/bot|crawl|spider|facebookexternalhit|preview|slurp/i.test(ua)) after(() => recordListingView(listing.id));
  const origin = siteOrigin();
  const images = listing.photos.map((p) => mediaUrl(p.path)).filter((u): u is string => Boolean(u));
  return (
    <>
      {origin ? (
        // Structured data for search engines. The text is the owner's own, with "<" escaped.
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(listingJsonLd(listing, `${origin}${publicListingPath(listing.id)}`, images)) }} />
      ) : null}
      <PublicListingView listing={listing} inquiry={sendInquiry.bind(null, listing.id)} matchEmails={matchAlertsOn()} />
    </>
  );
}
