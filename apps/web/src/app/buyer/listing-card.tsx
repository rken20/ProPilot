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
  condominium: "from-[#dfe8fb] to-[#c4d4f6]",
  house_and_lot: "from-[#e2f1ea] to-[#c6e3d5]",
  townhouse: "from-[#f3eadf] to-[#e8d6c0]",
  lot: "from-[#eef0dc] to-[#dde2b8]",
  commercial: "from-[#e6e3f3] to-[#cfc9ea]",
  other: "from-[#eceef2] to-[#d9dde5]",
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
        className="grid size-9 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-black/5 hover:bg-white"
      >
        <Heart className={cx("size-[18px]", saved ? "fill-rose-500 text-rose-500" : "text-ink")} aria-hidden />
      </button>
    </form>
  );
}

export function ListingCard({ listing, saved }: { listing: Listing; saved: boolean }) {
  const fin = financingLabels(listing.financing);
  const cover = mediaUrl(listing.cover_thumb_path ?? listing.cover_path);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line bg-white">
      <Link href={`/buyer/listings/${listing.id}`} className="block">
        <div className="relative">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- pre-sized thumbnail from storage
            <img src={cover} alt="" loading="lazy" className="aspect-[16/10] w-full bg-surface object-cover" />
          ) : (
            <ListingArt type={listing.type} className="aspect-[16/10]" />
          )}
          {listing.photo_count && listing.photo_count > 1 ? (
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
              <Camera className="size-3.5" aria-hidden /> {listing.photo_count}
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <p className="text-xl font-bold tracking-tight tabular-nums">{formatPeso(listing.price_minor, listing.currency)}</p>
          <h3 className="mt-1 truncate font-semibold group-hover:text-brand-700">{listing.name}</h3>
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
