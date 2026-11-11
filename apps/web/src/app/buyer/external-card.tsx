import { ExternalLink, Heart, MapPin } from "lucide-react";
import { cx } from "@/components/ui";
import type { ExternalListing } from "@/lib/external-listings";
import { formatPeso } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import { timeAgo } from "@/lib/time";
import { toggleExternalFavorite } from "./online-actions";
import { ListingArt } from "./listing-card";

/**
 * A listing found on another site. Facts only, no photo; the buyer opens the
 * original page to see photos and contact the lister there.
 */
export function ExternalCard({ listing, saved }: { listing: ExternalListing; saved: boolean }) {
  const facts = [
    listing.type ? TYPE_LABEL[listing.type] : null,
    listing.bedrooms === null ? null : listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? "" : "s"}`,
    listing.floor_area_sqm ? `${Number(listing.floor_area_sqm).toLocaleString("en-PH")} m²` : null,
  ].filter(Boolean) as string[];

  return (
    <article className="pp-lift group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
      <a href={listing.source_url} target="_blank" rel="noopener noreferrer nofollow" className="flex flex-1 flex-col">
        <div className="relative overflow-hidden">
          <ListingArt type={listing.type ?? "other"} className="pp-zoom aspect-[16/7]" />
          <span className="absolute bottom-2.5 left-3 rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold text-ink shadow-sm">
            On {listing.source_name}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="font-display text-2xl font-medium tabular-nums">
            {listing.price_minor ? formatPeso(listing.price_minor, listing.currency) : "Price on the listing"}
          </p>
          <h3 className="mt-1 line-clamp-2 font-semibold transition-colors group-hover:text-brand-700">{listing.title}</h3>
          {listing.location ? (
            <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {listing.location}
            </p>
          ) : null}
          {facts.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {facts.map((f) => (
                <span key={f} className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted">
                  {f}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm">
            <span className="text-xs text-muted">Found {timeAgo(listing.last_seen_at)}</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700">
              See photos and contact
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(opens {listing.source_name} in a new tab)</span>
            </span>
          </div>
        </div>
      </a>
      <form action={toggleExternalFavorite.bind(null, listing.id, saved)} className="absolute right-3 top-3">
        <button
          aria-label={saved ? "Remove from saved" : "Save listing"}
          aria-pressed={saved}
          className="grid size-10 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-black/5 transition-transform duration-200 hover:scale-105 hover:bg-white active:scale-90"
        >
          <Heart className={cx("size-[18px]", saved ? "pp-pop fill-hot text-hot" : "text-ink")} aria-hidden />
        </button>
      </form>
    </article>
  );
}
