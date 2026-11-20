import Link from "next/link";
import { MapPin } from "lucide-react";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";
import { Logo } from "@/components/logo";
import type { FormState } from "@/lib/form";
import { financingLabels } from "@/lib/listings";
import { mediaUrl } from "@/lib/media";
import { formatPeso } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import type { PublicListing } from "@/lib/public-listing";
import { Gallery } from "./gallery";
import { LoanEstimator } from "./loan-estimator";
import { ViewingForm } from "./viewing-form";

/** A tinted panel when a listing has no photos yet. */
function NoPhotos({ name }: { name: string }) {
  return (
    <div className="grid aspect-[16/9] place-items-center rounded-[1.5rem] bg-gradient-to-br from-tile-lavender via-tile-sky to-tile-mint">
      <div className="text-center">
        <Icon3d name="houses" size={96} className="mx-auto" />
        <p className="mt-2 text-sm font-medium text-muted">Photos of {name} are coming soon</p>
      </div>
    </div>
  );
}

/** A listing's public page, as anyone with the link sees it. */
export function PublicListingView({ listing, inquiry }: { listing: PublicListing; inquiry: (prev: FormState, form: FormData) => Promise<FormState> }) {
  const photos = listing.photos.map((p) => ({ id: p.id, full: mediaUrl(p.path) ?? "", thumb: mediaUrl(p.thumb) ?? "" }));
  const fin = financingLabels(listing.financing);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const facts: Array<{ icon: Icon3dName; tile: string; label: string; value: string }> = [
    { icon: "houses", tile: "bg-tile-lavender", label: "Type", value: TYPE_LABEL[listing.type as keyof typeof TYPE_LABEL] ?? "Property" },
    {
      icon: "key",
      tile: "bg-tile-lemon",
      label: "Reservation fee",
      value: listing.reservation_fee_minor === null ? "Ask the agent" : formatPeso(listing.reservation_fee_minor, listing.currency),
    },
    {
      icon: "money",
      tile: "bg-tile-mint",
      label: "Downpayment",
      value: listing.financing?.downpaymentPercent === undefined ? "Ask the agent" : `${listing.financing.downpaymentPercent}%`,
    },
    { icon: "card", tile: "bg-tile-sky", label: "Financing", value: fin.length ? fin.join(", ") : "Ask the agent" },
  ];

  return (
    <div className="min-h-screen bg-[var(--pp-ground)]">
      <header className="bg-gradient-to-r from-frame-1 to-frame-3 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="MyHomeSeller">
            <Logo tone="dark" />
          </Link>
          <p className="truncate text-sm text-white/80">
            Listed by <span className="font-semibold text-white">{listing.business_name}</span>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-7">
            <div className="relative">
              {photos.length ? <Gallery photos={photos} title={listing.name} /> : <NoPhotos name={listing.name} />}
              {listing.status === "reserved" ? (
                <span className="absolute left-4 top-4 rounded-full bg-tile-lemon px-3 py-1 text-xs font-bold text-brass-700">Reserved</span>
              ) : (
                <span className="absolute left-4 top-4 rounded-full bg-tile-mint px-3 py-1 text-xs font-bold text-brand-700">Available</span>
              )}
            </div>

            <div>
              <p className="text-[34px] font-extrabold leading-none tracking-tight text-grape-700 tabular-nums">{formatPeso(listing.price_minor, listing.currency)}</p>
              <h1 className="font-display mt-3 text-[2rem] leading-tight font-extrabold text-balance">{listing.name}</h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-muted">
                <MapPin className="size-4" aria-hidden /> {listing.location}
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label} className={`pp-bounce flex items-center gap-3 rounded-[var(--radius-tile)] p-4 ${f.tile}`}>
                  <Icon3d name={f.icon} size={40} />
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-muted">{f.label}</dt>
                    <dd className="mt-0.5 text-[15px] font-bold">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>

            {listing.description ? (
              <section>
                <h2 className="text-lg font-bold">About this property</h2>
                <p className="mt-2 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{listing.description}</p>
              </section>
            ) : null}
            {listing.financing?.notes ? (
              <section>
                <h2 className="text-lg font-bold">Financing notes</h2>
                <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink/85">{listing.financing.notes}</p>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)]" aria-labelledby="ask-title">
              <div className="mb-4 flex items-center gap-3">
                <Icon3d name="wave" size={44} />
                <div>
                  <h2 id="ask-title" className="text-lg font-bold leading-tight">
                    Interested? Ask {listing.business_name}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">Ask a question or pick a day to see it.</p>
                </div>
              </div>
              <ViewingForm action={inquiry} minDate={today} agent={listing.business_name} />
            </section>
            <LoanEstimator priceMinor={listing.price_minor} defaultDownpayment={listing.financing?.downpaymentPercent} />
          </aside>
        </div>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Shared with <Link href="/" className="font-semibold text-grape-700">MyHomeSeller</Link>, the AI sales assistant for property owners and agents.
      </footer>
    </div>
  );
}
