import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { getFavoriteIds, searchListings } from "@/lib/listings";
import { ListingCard } from "../listing-card";
import { ExternalCard } from "../external-card";
import { getSavedExternal, onlineSearchEnabled } from "@/lib/external-data";

export default async function SavedPage() {
  const [favorites, { listings }, external] = await Promise.all([
    getFavoriteIds(),
    searchListings({}),
    onlineSearchEnabled() ? getSavedExternal() : [],
  ]);
  const saved = listings.filter((l) => favorites.has(l.id));
  const gone = favorites.size - saved.length;

  return (
    <>
      <h1 className="font-display text-[2.25rem] leading-tight font-medium">Saved</h1>
      <p className="mt-1 text-muted">Only you can see your shortlist.</p>
      {saved.length === 0 && external.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <p className="font-semibold">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted">Tap the heart on any listing to keep it here.</p>
          <Link href="/buyer" className={buttonClass("primary", "mt-5")}>
            Browse listings
          </Link>
        </div>
      ) : saved.length ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((l) => (
            <ListingCard key={l.id} listing={l} saved />
          ))}
        </div>
      ) : null}
      {external.length ? (
        <section className={saved.length ? "mt-12" : "mt-8"} aria-labelledby="saved-external">
          <h2 id="saved-external" className="font-display text-2xl font-medium">
            From other sites
          </h2>
          <p className="mt-1 text-sm text-muted">Open a listing to check it&apos;s still available and contact the lister.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {external.map((l) => (
              <ExternalCard key={l.id} listing={l} saved />
            ))}
          </div>
        </section>
      ) : null}
      {gone > 0 ? (
        <p className="mt-6 text-sm text-muted">
          {gone} saved listing{gone === 1 ? " is" : "s are"} no longer available.
        </p>
      ) : null}
    </>
  );
}
