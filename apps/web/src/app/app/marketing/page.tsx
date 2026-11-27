import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { FACT_COLUMNS, factsOf } from "@/lib/buyer-finder";
import { businessPages } from "@/lib/facebook-pages";
import { appSay } from "@/lib/lang-server";
import { manilaMonthStart, rankMatches, scoreMatch } from "@/lib/matching";
import { metaConfig } from "@/lib/meta";
import { businessPlan } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { daysAgoIso } from "@/lib/time";
import { businessUsage } from "@/lib/usage";
import { MarketingView, type MarketingData } from "./marketing-view";

export const metadata = { title: "Marketing Agent" };

/** The Marketing Agent: videos, Facebook posts, the most-viewed listing and leads that fit a listing. */
export default async function MarketingPage() {
  const biz = await requireBusiness();
  const say = await appSay();
  const supabase = await createClient();
  const canSeeLeads =
    can(biz.role, "lead.viewAll") || can(biz.role, "lead.viewAssigned");

  const [plan, connected, listingsRes, viewsRes, postsRes, leadsRes] =
    await Promise.all([
      businessPlan(biz.businessId),
      metaConfig()
        ? businessPages(biz.businessId).then((pages) => pages.length > 0)
        : Promise.resolve(false),
      supabase
        .from("properties")
        .select(
          "id, name, type, location, price_minor, financing, status, is_public",
        )
        .eq("business_id", biz.businessId)
        .in("status", ["available", "reserved"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("listing_views")
        .select("property_id, views")
        .eq("business_id", biz.businessId)
        .gte("day", daysAgoIso(30).slice(0, 10)),
      supabase
        .from("facebook_posts")
        .select("id", { count: "exact", head: true })
        .eq("business_id", biz.businessId)
        .gte("created_at", manilaMonthStart()),
      // Row-level security returns only the leads this person may see (agents: their own).
      canSeeLeads
        ? supabase
            .from("prospects")
            .select(`id, name, ${FACT_COLUMNS}`)
            .eq("business_id", biz.businessId)
            .not("stage", "in", "(won,lost)")
            .order("last_activity_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: null }),
    ]);
  const listings = listingsRes.data ?? [];
  const forSale = listings.filter((l) => l.status === "available");

  const viewsBy = new Map<string, number>();
  for (const v of viewsRes.data ?? [])
    viewsBy.set(
      v.property_id as string,
      (viewsBy.get(v.property_id as string) ?? 0) + Number(v.views),
    );
  const top = listings
    .map((l) => ({
      id: l.id as string,
      name: l.name as string,
      views: viewsBy.get(l.id as string) ?? 0,
      isPublic: Boolean(l.is_public),
    }))
    .filter((l) => l.views > 0)
    .sort((a, b) => b.views - a.views)[0];

  // Each lead once, with the listing it fits best.
  let buyers: MarketingData["buyers"] = null;
  if (leadsRes.data) {
    const best = new Map<
      string,
      { id: string; name: string; score: number; listing: string }
    >();
    const rows = leadsRes.data as unknown as Array<Record<string, unknown>>;
    for (const l of forSale) {
      const listing = {
        type: l.type as string,
        location: l.location as string,
        price_minor: Number(l.price_minor),
        financing: l.financing as never,
      };
      for (const { item, match } of rankMatches(
        rows,
        (r) => scoreMatch(listing, factsOf(r)),
        20,
      )) {
        const id = item.id as string;
        if ((best.get(id)?.score ?? -1) < match.score)
          best.set(id, {
            id,
            name: (item.name as string | null) || "Unnamed lead",
            score: Math.round(match.score),
            listing: l.name as string,
          });
      }
    }
    buyers = [...best.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  }

  const videoUse =
    plan.videoAds !== 0
      ? (await businessUsage(supabase, biz.businessId, plan)).find(
          (u) => u.key === "videoAds",
        )
      : undefined;
  const data: MarketingData = {
    videos:
      plan.videoAds !== 0
        ? { used: videoUse?.used ?? 0, limit: plan.videoAds }
        : null,
    facebook: {
      connected,
      postsThisMonth: postsRes.count ?? 0,
      postHref: forSale[0] ? `/app/properties/${forSale[0].id}` : null,
    },
    canSeeAnalyst:
      can(biz.role, "analytics.view") || can(biz.role, "content.publish"),
    top: top ?? null,
    hasListings: listings.length > 0,
    buyers,
  };
  return <MarketingView data={data} say={say} />;
}
