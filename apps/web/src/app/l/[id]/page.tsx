import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { mediaUrl } from "@/lib/media";
import { formatPeso } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import { getPublicListing, recordListingView } from "@/lib/public-listing";
import { sendInquiry } from "./actions";
import { PublicListingView } from "./listing-view";

/** Link previews on Facebook, Messenger and SMS show the listing's photo, price and place. */
export async function generateMetadata({ params }: PageProps<"/l/[id]">): Promise<Metadata> {
  const listing = await getPublicListing((await params).id);
  if (!listing) return { title: "Listing not available · MyHomeSeller", robots: { index: false } };
  const title = `${listing.name} · ${formatPeso(listing.price_minor, listing.currency)}`;
  const description = `${TYPE_LABEL[listing.type as keyof typeof TYPE_LABEL] ?? "Property"} in ${listing.location}, listed by ${listing.business_name}.`;
  const cover = listing.photos[0] ? mediaUrl(listing.photos[0].path) : null;
  return {
    title: `${title} · MyHomeSeller`,
    description,
    openGraph: { title, description, type: "website", ...(cover ? { images: [{ url: cover }] } : {}) },
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
  return <PublicListingView listing={listing} inquiry={sendInquiry.bind(null, listing.id)} />;
}
