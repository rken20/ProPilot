import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Search, Star } from "lucide-react";
import { Icon3d } from "@/components/icon-3d";
import { Logo } from "@/components/logo";
import { SiteLangToggle } from "@/components/site-lang-toggle";
import { EmptyState, Input, Label, Select, buttonClass } from "@/components/ui";
import {
  BROWSE_PATH,
  BROWSE_SORTS,
  browseHref,
  type BrowseQuery,
  type BrowseSort,
} from "@/lib/browse-rules";
import { sayIn, type Lang } from "@/lib/lang";
import { financingLabels } from "@/lib/listings";
import { mediaUrl } from "@/lib/media";
import { formatPeso } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import { publicListingPath, type BrowseListing } from "@/lib/public-listing";

const SORT_LABEL: Record<BrowseSort, string> = {
  featured: "Featured first",
  newest: "Newest",
  price_low: "Price: low to high",
  price_high: "Price: high to low",
};

const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

/** The public Properties page, drawn from what the page found. */
export function PropertiesView({
  query,
  found,
  lang,
  configured,
}: {
  query: BrowseQuery;
  found: { items: BrowseListing[]; page: number; pages: number; total: number };
  lang: Lang;
  configured: boolean;
}) {
  const say = sayIn(lang);
  const searching = Boolean(query.q || query.type);

  return (
    <div className="flex min-h-svh flex-col bg-[var(--pp-ground)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <header className="bg-frame-1 text-white">
        <div className={`${wrap} flex items-center justify-between gap-3 py-4`}>
          <Link href="/" aria-label="MyHomeSeller home">
            <Logo className="text-white" tone="dark" />
          </Link>
          <nav className="flex items-center gap-1.5 text-sm font-bold">
            <Link
              href={BROWSE_PATH}
              aria-current="page"
              className="inline-flex min-h-11 items-center rounded-full bg-white/15 px-4 text-white max-sm:hidden"
            >
              Properties
            </Link>
            <Link
              href="/get-app"
              className="inline-flex min-h-11 items-center rounded-full px-4 text-white/90 hover:bg-white/10 max-md:hidden"
            >
              Get the App
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-full px-4 whitespace-nowrap text-white/90 hover:bg-white/10"
            >
              Log In
            </Link>
            {configured ? (
              <Link
                href="/signup"
                className={buttonClass(
                  "primary",
                  "ml-1.5 min-h-11 max-sm:hidden",
                )}
              >
                Create an Account
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <main id="main" className={`${wrap} flex-1 py-8 lg:py-12`}>
        <div className="flex items-start gap-4">
          <Icon3d name="houses" size={56} className="max-sm:hidden" />
          <div>
            <h1 className="font-display text-[2rem] leading-tight font-extrabold sm:text-[2.6rem]">
              Properties for Sale
            </h1>
            <p className="mt-2 max-w-2xl text-lg text-muted">
              {say(
                "Listed by owners and agents. Open one to see its photos and financing, and to ask the seller directly.",
                "Naka-list ng mga owner at agent. Buksan ang isa para makita ang photos at financing, at para direktang magtanong sa seller.",
              )}
            </p>
          </div>
        </div>

        <form
          action={BROWSE_PATH}
          method="get"
          role="search"
          className="mt-7 grid gap-3 rounded-[1.5rem] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-end"
        >
          <div>
            <Label htmlFor="q">
              {say("City, area or name", "City, area o pangalan")}
            </Label>
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={query.q}
              maxLength={60}
              placeholder={say(
                "For example: Iloilo, condo, Lanag",
                "Halimbawa: Iloilo, condo, Lanag",
              )}
            />
          </div>
          <div>
            <Label htmlFor="type">Type</Label>
            <Select id="type" name="type" defaultValue={query.type ?? ""}>
              <option value="">{say("Any type", "Kahit anong type")}</option>
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sort">Sort by</Label>
            <Select id="sort" name="sort" defaultValue={query.sort}>
              {BROWSE_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <button
            type="submit"
            className={buttonClass(
              "primary",
              "min-h-11 sm:col-span-2 lg:col-span-1",
            )}
          >
            <Search className="size-4" aria-hidden /> Search
          </button>
        </form>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="font-semibold" role="status">
            {found.total === 1 ? "1 property" : `${found.total} properties`}
            {searching ? (
              <>
                {" "}
                <Link
                  href={browseHref(query, { q: "", type: null, page: 1 })}
                  className="ml-2 text-sm font-semibold text-grape-700 underline underline-offset-2"
                >
                  {say("Clear the search", "I-clear ang search")}
                </Link>
              </>
            ) : null}
          </p>
          {query.sort === "featured" && found.total > 0 ? (
            <p className="text-sm text-muted">
              {say(
                "Featured first: listings from sellers on a paid plan show before the others.",
                "Featured first: nauuna ang listings ng sellers na naka-paid plan.",
              )}
            </p>
          ) : null}
        </div>

        {found.items.length ? (
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {found.items.map((l, i) => (
              <Card key={l.id} listing={l} eager={i < 3} />
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-4"
            icon={searching ? "search" : "houses"}
            tone="sky"
            title={
              searching
                ? say(
                    "No properties match that search",
                    "Walang property na tugma sa search",
                  )
                : say("No properties here yet", "Wala pang property dito")
            }
            action={
              searching ? (
                <Link href={BROWSE_PATH} className={buttonClass("secondary")}>
                  {say("See all properties", "Tingnan lahat ng properties")}
                </Link>
              ) : null
            }
          >
            {searching
              ? say(
                  "Try a nearby city, or fewer words.",
                  "Subukan ang kalapit na city, o mas kaunting salita.",
                )
              : say(
                  "Listings appear here as soon as a seller gives one a public page.",
                  "Lalabas dito ang listings kapag binigyan ito ng seller ng public page.",
                )}
          </EmptyState>
        )}

        {found.pages > 1 ? (
          <nav
            aria-label="Pages"
            className="mt-8 flex items-center justify-center gap-3"
          >
            {found.page > 1 ? (
              <Link
                href={browseHref(query, { page: found.page - 1 })}
                rel="prev"
                className={buttonClass("secondary", "min-h-11")}
              >
                <ArrowLeft className="size-4" aria-hidden /> Previous
              </Link>
            ) : null}
            <p className="text-sm font-semibold text-muted tabular-nums">
              Page {found.page} of {found.pages}
            </p>
            {found.page < found.pages ? (
              <Link
                href={browseHref(query, { page: found.page + 1 })}
                rel="next"
                className={buttonClass("secondary", "min-h-11")}
              >
                Next <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </nav>
        ) : null}

        <section className="mt-12 flex flex-wrap items-center justify-between gap-x-8 gap-y-5 rounded-[2rem] bg-frame-1 p-7 text-white sm:p-9">
          <div className="flex min-w-0 max-w-2xl items-center gap-4">
            <Icon3d name="key" size={56} className="max-sm:hidden" />
            <div>
              <h2 className="font-display text-[1.6rem] leading-tight font-extrabold sm:text-[1.9rem]">
                Selling a Property?
              </h2>
              <p className="mt-1.5 text-white/80">
                {say(
                  "List it free. It gets its own page here, and the AI can answer buyers for you.",
                  "I-list ito nang libre. May sarili itong page dito, at pwedeng ang AI ang sumagot sa buyers para sa'yo.",
                )}
              </p>
            </div>
          </div>
          {configured ? (
            <Link
              href="/signup"
              className={buttonClass("sun", "min-h-12 px-7 text-[15px]")}
            >
              Create Your Free Account{" "}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </section>
      </main>

      <footer className="bg-frame-1 text-white">
        <div
          className={`${wrap} flex flex-col gap-4 border-t border-white/10 py-8 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between`}
        >
          <Logo className="text-white" tone="dark" />
          <Link
            href="/"
            className="font-semibold text-white/85 hover:text-white"
          >
            {say("About MyHomeSeller", "Tungkol sa MyHomeSeller")}
          </Link>
          <SiteLangToggle lang={lang} tone="dark" />
          <p>Philippines · 3D icons by Microsoft Fluent Emoji (MIT)</p>
        </div>
      </footer>
    </div>
  );
}

function Card({
  listing: l,
  eager,
}: {
  listing: BrowseListing;
  eager: boolean;
}) {
  const photo = mediaUrl(l.thumb);
  const tags = [
    TYPE_LABEL[l.type as keyof typeof TYPE_LABEL] ?? "Property",
    ...financingLabels(l.financing),
  ];
  return (
    <li>
      <Link
        href={publicListingPath(l.id)}
        className="pp-lift group flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-card)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-tile-lavender via-tile-sky to-tile-mint">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the seller's own photo, already sized as a thumbnail
            <img
              src={photo}
              alt=""
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              className="pp-zoom absolute inset-0 size-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center">
              <Icon3d name="houses" size={72} />
            </span>
          )}
          <span className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            {l.featured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sun px-2.5 py-1 text-xs font-extrabold text-sun-ink shadow-sm">
                <Star className="size-3.5 fill-current" aria-hidden /> Featured
              </span>
            ) : (
              <span />
            )}
            {l.status === "reserved" ? (
              <span className="rounded-full bg-tile-lemon px-2.5 py-1 text-xs font-bold text-brass-700 shadow-sm">
                Reserved
              </span>
            ) : null}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <p className="text-[1.45rem] leading-none font-extrabold tracking-tight text-grape-700 tabular-nums">
            {formatPeso(l.price_minor, l.currency)}
          </p>
          <h2 className="mt-2 line-clamp-2 text-[1.05rem] leading-snug font-bold text-balance">
            {l.name}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-4 shrink-0" aria-hidden />{" "}
            <span className="truncate">{l.location}</span>
          </p>
          <ul className="mt-auto flex flex-wrap gap-1.5 pt-3.5">
            {tags.map((t) => (
              <li
                key={t}
                className="rounded-full bg-tile-sky px-2.5 py-0.5 text-xs font-semibold text-ink/80"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Link>
    </li>
  );
}
