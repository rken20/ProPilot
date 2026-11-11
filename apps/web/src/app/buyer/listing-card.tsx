import Link from "next/link";
import { Building2, Camera, Heart, MapPin } from "lucide-react";
import { cx } from "@/components/ui";
import { formatPeso } from "@/lib/money";
import { financingLabels, type Listing } from "@/lib/listings";
import { mediaUrl } from "@/lib/media";
import { TYPE_LABEL } from "@/lib/property-labels";
import { toggleFavorite } from "./actions";

/** Placeholder art until listing photos arrive: a tinted panel per property type. */
const TINTS: Record<string, string> = {
  condominium: "from-[#e9ece6] to-[#d3dbd2]",
  house_and_lot: "from-[#e4ece4] to-[#c9d9cc]",
  townhouse: "from-[#f2ebe0] to-[#e3d5c0]",
  lot: "from-[#eeeddf] to-[#dcd9bd]",
  commercial: "from-[#ecebe7] to-[#d8d5ce]",
  other: "from-[#efede9] to-[#dcd8d0]",
};

export function ListingArt({ type, className }: { type: string; className?: string }) {
  return (
    <div className={cx("grid place-items-center bg-gradient-to-br", TINTS[type] ?? TINTS.other, className)}>
      <Building2 className="size-10 text-brand-900/25" aria-hidden />
    </div>
  );
}

export function FavoriteButton({ id, saved, className }: { id: string; saved: boolean; className?: string }) {
  return (
    <form action={toggleFavorite.bind(null, id, saved)} className={className}>
      <button
        aria-label={saved ? "Remove from saved" : "Save listing"}
        aria-pressed={saved}
        className="grid size-10 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-black/5 transition-transform duration-200 hover:scale-105 hover:bg-white active:scale-90"
      >
        <Heart className={cx("size-[18px]", saved ? "pp-pop fill-hot text-hot" : "text-ink")} aria-hidden />
      </button>
    </form>
  );
}

export function ListingCard({ listing, saved }: { listing: Listing; saved: boolean }) {
  const fin = financingLabels(listing.financing);
  const cover = mediaUrl(listing.cover_thumb_path ?? listing.cover_path);
  return (
    <article className="pp-lift group relative overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
      <Link href={`/buyer/listings/${listing.id}`} className="block">
        <div className="relative overflow-hidden">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- pre-sized thumbnail from storage
            <img src={cover} alt="" loading="lazy" className="pp-zoom aspect-[16/10] w-full bg-surface object-cover" />
          ) : (
            <ListingArt type={listing.type} className="pp-zoom aspect-[16/10]" />
          )}
          {listing.photo_count && listing.photo_count > 1 ? (
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
              <Camera className="size-3.5" aria-hidden /> {listing.photo_count}
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <p className="font-display text-2xl font-medium tabular-nums">{formatPeso(listing.price_minor, listing.currency)}</p>
          <h3 className="mt-1 truncate font-semibold transition-colors group-hover:text-brand-700">{listing.name}</h3>
          <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {listing.location}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted">{TYPE_LABEL[listing.type]}</span>
            {fin.slice(0, 2).map((f) => (
              <span key={f} className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted">
                {f}
              </span>
            ))}
          </div>
        </div>
      </Link>
      {listing.status === "reserved" ? (
        <span className="absolute left-3 top-3 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Reserved</span>
      ) : null}
      <FavoriteButton id={listing.id} saved={saved} className="absolute right-3 top-3" />
    </article>
  );
}
