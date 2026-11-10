import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { getFavoriteIds, searchListings } from "@/lib/listings";
import { ListingCard } from "../listing-card";

export default async function SavedPage() {
  const [favorites, { listings }] = await Promise.all([getFavoriteIds(), searchListings({})]);
  const saved = listings.filter((l) => favorites.has(l.id));
  const gone = favorites.size - saved.length;

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">Saved</h1>
      <p className="mt-1 text-muted">Your shortlist. Only you can see it.</p>
      {saved.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <p className="font-semibold">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted">Tap the heart on any listing to keep it here.</p>
          <Link href="/buyer" className={buttonClass("primary", "mt-5")}>
            Browse listings
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((l) => (
            <ListingCard key={l.id} listing={l} saved />
          ))}
        </div>
      )}
      {gone > 0 ? (
        <p className="mt-6 text-sm text-muted">
          {gone} saved listing{gone === 1 ? " is" : "s are"} no longer available.
        </p>
      ) : null}
    </>
  );
}
