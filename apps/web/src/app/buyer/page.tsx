import { Search } from "lucide-react";
import { PROPERTY_TYPES } from "@propilot/shared";
import { Alert, buttonClass } from "@/components/ui";
import { getFavoriteIds, searchListings } from "@/lib/listings";
import { pesosToCentavos } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import { ListingCard } from "./listing-card";

const BUDGETS = [
  ["", "Any budget"],
  ["2000000", "Up to ₱2M"],
  ["4000000", "Up to ₱4M"],
  ["6000000", "Up to ₱6M"],
  ["10000000", "Up to ₱10M"],
  ["20000000", "Up to ₱20M"],
] as const;

export default async function BrowsePage({ searchParams }: PageProps<"/buyer">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const type = typeof sp.type === "string" && (PROPERTY_TYPES as readonly string[]).includes(sp.type) ? sp.type : "";
  const max = typeof sp.max === "string" ? sp.max : "";
  const maxMinor = max ? pesosToCentavos(max) : null;

  const [{ listings, error }, favorites] = await Promise.all([
    searchListings({ q, type, maxPriceMinor: maxMinor && Number.isFinite(maxMinor) ? maxMinor : undefined }),
    getFavoriteIds(),
  ]);
  const filtered = Boolean(q || type || max);

  const select =
    "rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none transition-[border-color,box-shadow] hover:border-zinc-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-100";

  return (
    <>
      <h1 className="font-display text-[2.25rem] leading-tight font-medium">Find a property</h1>
      <p className="mt-2 text-muted">Ask about any listing and get an answer straight from the agent&apos;s details.</p>

      <form className="mt-7 grid gap-2 rounded-2xl border border-line bg-white p-2 shadow-[var(--shadow-card)] sm:grid-cols-[1fr_180px_160px_auto]" role="search">
        <label className="relative">
          <span className="sr-only">City, area or property name</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="City, area or property name"
            className="w-full rounded-xl border border-transparent bg-surface py-2.5 pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow,background-color] focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />
        </label>
        <label>
          <span className="sr-only">Property type</span>
          <select name="type" defaultValue={type} className={`${select} w-full`}>
            <option value="">All types</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Budget</span>
          <select name="max" defaultValue={max} className={`${select} w-full`}>
            {BUDGETS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass("primary", "py-2.5")}>Search</button>
      </form>

      {error ? (
        <div className="mt-6">
          <Alert>Couldn&apos;t load listings. Refresh to try again.</Alert>
        </div>
      ) : null}

      <p className="mt-6 text-sm text-muted">
        {listings.length === 0 ? "" : `${listings.length} listing${listings.length === 1 ? "" : "s"}`}
      </p>

      {listings.length === 0 && !error ? (
        <div className="mt-2 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <p className="font-semibold">{filtered ? "No listings match your search" : "No listings yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {filtered ? "Try a wider area or a higher budget." : "Agents are adding properties during the beta. Check back soon."}
          </p>
        </div>
      ) : (
        <div className="pp-stagger mt-2 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l, i) => (
            <div key={l.id} style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
              <ListingCard listing={l} saved={favorites.has(l.id)} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
