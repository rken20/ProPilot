import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { financingLabels, getFavoriteIds, getListing, getListingPhotos } from "@/lib/listings";
import { mediaUrl } from "@/lib/media";
import { formatPeso } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import { requestViewing } from "../../actions";
import { FavoriteButton, ListingArt } from "../../listing-card";
import { Gallery } from "./gallery";
import { ListingChat } from "./listing-chat";
import { LoanEstimator } from "./loan-estimator";
import { ViewingForm } from "./viewing-form";

export default async function ListingPage({ params }: PageProps<"/buyer/listings/[id]">) {
  const { id } = await params;
  const [listing, favorites, profile, rawPhotos] = await Promise.all([getListing(id), getFavoriteIds(), getProfile(), getListingPhotos(id)]);
  if (!listing) notFound();
  const photos = rawPhotos.map((p) => ({
    id: p.id,
    full: mediaUrl(p.storage_path) ?? "",
    thumb: mediaUrl(p.thumb_path ?? p.storage_path) ?? "",
  }));

  const fin = financingLabels(listing.financing);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

  const facts: Array<[string, string]> = [
    ["Type", TYPE_LABEL[listing.type]],
    ["Status", listing.status === "available" ? "Available" : "Reserved"],
    ["Reservation fee", listing.reservation_fee_minor === null ? "Ask the agent" : formatPeso(listing.reservation_fee_minor, listing.currency)],
    ["Downpayment", listing.financing?.downpaymentPercent === undefined ? "Ask the agent" : `${listing.financing.downpaymentPercent}%`],
    ["Financing", fin.length ? fin.join(", ") : "Ask the agent"],
    ["Listed by", listing.business_name],
  ];

  return (
    <>
      <Link href="/buyer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All listings
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div className="relative overflow-hidden rounded-2xl">
            {photos.length ? (
              <Gallery photos={photos} title={listing.name} />
            ) : (
              <ListingArt type={listing.type} className="aspect-[16/8]" />
            )}
            <FavoriteButton id={listing.id} saved={favorites.has(listing.id)} className="absolute right-4 top-4" />
            {listing.status === "reserved" ? (
              <span className="absolute left-4 top-4 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Reserved</span>
            ) : null}
          </div>

          <div>
            <p className="text-[32px] font-bold leading-none tracking-tight tabular-nums">{formatPeso(listing.price_minor, listing.currency)}</p>
            <h1 className="font-display mt-3 text-[2.25rem] leading-tight font-medium">{listing.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-muted">
              <MapPin className="size-4" aria-hidden /> {listing.location}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          {listing.description ? (
            <section>
              <h2 className="font-semibold">About this property</h2>
              <p className="mt-2 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{listing.description}</p>
            </section>
          ) : null}
          {listing.financing?.notes ? (
            <section>
              <h2 className="font-semibold">Financing notes</h2>
              <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink/85">{listing.financing.notes}</p>
            </section>
          ) : null}

          <ListingChat propertyId={listing.id} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-semibold">Request a viewing</h2>
            <p className="mb-4 mt-1 text-sm text-muted">Sent straight to {listing.business_name}.</p>
            <ViewingForm
              action={requestViewing.bind(null, listing.id)}
              defaults={{ buyerName: profile?.full_name ?? "", buyerPhone: profile?.phone ?? "" }}
              minDate={today}
            />
          </section>
          <LoanEstimator priceMinor={listing.price_minor} defaultDownpayment={listing.financing?.downpaymentPercent} />
        </aside>
      </div>
    </>
  );
}
