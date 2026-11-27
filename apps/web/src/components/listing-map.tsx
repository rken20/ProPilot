import { MapPin } from "lucide-react";
import { mapEmbedUrl, mapLink } from "@/lib/map";

/**
 * The Google map of a listing's location, with a link that opens Google Maps.
 * The map loads when it comes near the screen. `query` is the listing's
 * location or the seller's exact pin (see lib/map.ts).
 */
export function ListingMap({
  query,
  title,
  linkLabel = "Open in Google Maps",
  className = "",
  shape = "aspect-[16/10]",
}: {
  query: string;
  title: string;
  linkLabel?: string;
  className?: string;
  /** The map's proportions, as Tailwind classes. */
  shape?: string;
}) {
  return (
    <div className={className}>
      <iframe
        src={mapEmbedUrl(query, process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY)}
        title={title}
        loading="lazy"
        allowFullScreen
        className={`block w-full rounded-[var(--radius-tile)] border border-line bg-tile-sky ${shape}`}
      />
      <a
        href={mapLink(query)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-grape-700 underline underline-offset-2"
      >
        <MapPin className="size-4" aria-hidden /> {linkLabel}
      </a>
    </div>
  );
}
