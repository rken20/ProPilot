import { X } from "lucide-react";
import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { factsOf } from "@/lib/buyer-finder";
import { getFavoriteIds, getListing, searchListings, type Listing } from "@/lib/listings";
import { OVER_BUDGET_SLACK, rankMatches, scoreMatch, type Match } from "@/lib/matching";
import { buyerAiEnabled } from "@/lib/plan";
import type { Preferences } from "@/lib/qualification";
import { createClient } from "@/lib/supabase/server";
import { ListingCard } from "../listing-card";
import { BuyerUpgradeNote } from "../upgrade-note";
import { clearPreferences, dismissIntroduction } from "./actions";
import { PreferencesForm } from "./preferences-form";

export default async function MySearchPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data }, basic] = await Promise.all([
    supabase
      .from("buyer_preferences")
      .select("budget_min_minor, budget_max_minor, areas, property_types, bedrooms_min, timeline, financing, must_haves, share_with_agents, open_to_agents, match_alerts")
      .eq("user_id", user.id)
      .maybeSingle(),
    buyerAiEnabled(user.id),
  ]);

  // Property matcher (Basic): listings agents sent, and Home Finder listings that fit.
  let sent: Array<{ id: string; listing: Listing }> = [];
  let fits: Array<{ listing: Listing; match: Match }> = [];
  let favorites = new Set<string>();
  if (basic) {
    const { data: intros } = await supabase
      .from("buyer_introductions")
      .select("id, property_id, seen_at")
      .eq("buyer_id", user.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    const loaded = await Promise.all((intros ?? []).map(async (i) => ({ id: i.id as string, listing: await getListing(i.property_id as string) })));
    sent = loaded.filter((x): x is { id: string; listing: Listing } => x.listing !== null && x.listing.status === "available");
    if ((intros ?? []).some((i) => !i.seen_at)) {
      await supabase.from("buyer_introductions").update({ seen_at: new Date().toISOString() }).eq("buyer_id", user.id).is("seen_at", null);
    }
    if (data) {
      const facts = factsOf(data);
      const { listings } = await searchListings({
        type: facts.property_types.length === 1 ? facts.property_types[0] : undefined,
        maxPriceMinor: facts.budget_max_minor === null ? undefined : Math.floor(facts.budget_max_minor * (1 + OVER_BUDGET_SLACK)),
      });
      const sentIds = new Set(sent.map((s) => s.listing.id));
      fits = rankMatches(
        listings.filter((l) => l.status === "available" && !sentIds.has(l.id)),
        (l) => scoreMatch(l, facts),
        6,
      ).map(({ item, match }) => ({ listing: item, match }));
    }
    favorites = await getFavoriteIds();
  }

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-[2.25rem] leading-tight font-medium">My search</h1>
        <p className="mt-2 text-muted">
          Tell agents your budget, areas and timing once, so they can answer with listings that fit instead of asking again. Every field is optional.
        </p>
      </header>

      {basic && sent.length ? (
        <section aria-labelledby="sent-title">
          <h2 id="sent-title" className="text-xl font-semibold">Sent to you by agents</h2>
          <p className="mt-1 text-sm text-muted">Agents with listings that fit your search. Message them from the listing if you&apos;re interested.</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sent.map((s) => (
              <div key={s.id}>
                <ListingCard listing={s.listing} saved={favorites.has(s.listing.id)} />
                <div className="mt-2 flex items-center justify-between gap-2 px-1 text-xs text-muted">
                  <span className="truncate">From {s.listing.business_name}</span>
                  <form action={dismissIntroduction.bind(null, s.id)}>
                    <SubmitButton variant="ghost" pendingText="Hiding…" className="px-2 py-1 text-xs">
                      <X className="size-3.5" aria-hidden /> Not for me
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {basic && data ? (
        <section aria-labelledby="fits-title">
          <h2 id="fits-title" className="text-xl font-semibold">Listings that fit</h2>
          {fits.length ? (
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {fits.map((f) => (
                <div key={f.listing.id}>
                  <ListingCard listing={f.listing} saved={favorites.has(f.listing.id)} />
                  <p className="mt-2 px-1 text-xs text-muted">
                    <span className="font-medium text-ink tabular-nums">{f.match.score}% match</span>
                    {f.match.fits.length ? ` · ${f.match.fits.join(", ")}` : ""}
                    {f.match.gaps.length ? ` · ${f.match.gaps.join(", ")}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Nothing on Home Finder fits yet. Add at least two of budget, areas and property type, and turn on match emails to hear when something does.
            </p>
          )}
        </section>
      ) : null}

      {!basic ? (
        <div className="max-w-2xl">
          <BuyerUpgradeNote title="Matching listings are part of Basic">
            On Basic, we show Home Finder listings that fit your search, email you new ones, and agents with a matching listing can send it to you.
          </BuyerUpgradeNote>
        </div>
      ) : null}

      <section aria-labelledby="search-title" className="max-w-2xl">
        <h2 id="search-title" className="text-xl font-semibold">What are you looking for?</h2>
        <Card className="mt-4">
          <PreferencesForm
            p={(data as Preferences | null) ?? null}
            share={data?.share_with_agents ?? true}
            matching={basic ? { openToAgents: data?.open_to_agents ?? false, matchAlerts: data?.match_alerts ?? false } : null}
          />
        </Card>
        {data ? (
          <form action={clearPreferences} className="mt-4">
            <SubmitButton variant="ghost" pendingText="Clearing…">
              Clear my answers
            </SubmitButton>
          </form>
        ) : null}
      </section>
    </div>
  );
}
