/**
 * Meta Marketing API calls for boosting a Page video for Messenger chats.
 * Steps and parameters follow Meta's "Ads that click to Messenger" guide (v25):
 * campaign → ad set (destination MESSENGER, optimization CONVERSATIONS) → video creative with a
 * Send Message button → ad, all created PAUSED, then switched on together. Calls use the business
 * owner's own Facebook sign-in, on their own ad account; Meta charges that account.
 */
import { CHAT_ACTION, readBoostInsights, type BoostResults } from "./boost-rules";
import { graphGet, graphGetFast, graphPost, GraphError, type MetaConfig } from "./meta";

type Fetch = typeof fetch;

/** The permissions a boost needs on the Facebook sign-in. */
export const AD_PERMISSIONS = ["ads_management", "ads_read", "pages_manage_ads"] as const;

/** Which permissions the person granted. */
export async function grantedPermissions(f: Fetch, cfg: MetaConfig, userToken: string): Promise<string[]> {
  const r = await graphGet<{ data?: Array<{ permission?: string; status?: string }> }>(f, cfg, "me/permissions", userToken);
  return (r.data ?? []).filter((p) => p.status === "granted" && typeof p.permission === "string").map((p) => p.permission!);
}

export type AdAccount = { id: string; name: string; currency: string; active: boolean };

/** The person's ad accounts. Only active PHP accounts can be used (budgets are set in centavos). */
export async function adAccounts(f: Fetch, cfg: MetaConfig, userToken: string): Promise<AdAccount[]> {
  const r = await graphGetFast<{ data?: Array<{ account_id?: string; name?: string; currency?: string; account_status?: number }> }>(f, cfg, "me/adaccounts", userToken, {
    fields: "account_id,name,currency,account_status",
    limit: "50",
  });
  return (r.data ?? [])
    .filter((a) => /^\d{1,30}$/.test(a.account_id ?? ""))
    .map((a) => ({ id: a.account_id!, name: (a.name ?? "Ad account").slice(0, 200), currency: a.currency ?? "", active: a.account_status === 1 }));
}

/** Meta's key for a Philippine town or city, for listings without an exact pin. */
export async function findCity(f: Fetch, cfg: MetaConfig, userToken: string, query: string): Promise<{ key: string; name: string } | null> {
  const r = await graphGetFast<{ data?: Array<{ key?: string; name?: string; country_code?: string }> }>(f, cfg, "search", userToken, {
    type: "adgeolocation",
    location_types: JSON.stringify(["city"]),
    q: query.slice(0, 100),
    country_code: "PH",
    limit: "1",
  });
  const c = r.data?.[0];
  return c?.key && c.country_code === "PH" ? { key: String(c.key), name: String(c.name ?? query) } : null;
}

/** The Page video's still frame (a video ad needs one) and the words it was posted with, which become the ad's text. */
export async function videoDetails(f: Fetch, cfg: MetaConfig, videoId: string, pageToken: string): Promise<{ picture: string | null; description: string }> {
  const r = await graphGetFast<{ picture?: string; description?: string }>(f, cfg, videoId, pageToken, { fields: "picture,description" });
  return { picture: r.picture?.startsWith("https://") ? r.picture : null, description: (r.description ?? "").slice(0, 1500) };
}

/** Meta's own estimate of how many people the audience holds, or null when Meta gives none. */
export async function deliveryEstimate(f: Fetch, cfg: MetaConfig, userToken: string, accountId: string, targeting: Record<string, unknown>): Promise<{ lower: number; upper: number } | null> {
  try {
    const r = await graphGetFast<{ data?: Array<{ estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number; estimate_ready?: boolean }> }>(
      f,
      cfg,
      `act_${accountId}/delivery_estimate`,
      userToken,
      { optimization_goal: "CONVERSATIONS", targeting_spec: JSON.stringify(targeting) },
    );
    const d = r.data?.[0];
    const lower = Number(d?.estimate_mau_lower_bound);
    const upper = Number(d?.estimate_mau_upper_bound);
    return Number.isFinite(lower) && Number.isFinite(upper) && upper > 0 ? { lower, upper } : null;
  } catch {
    return null;
  }
}

export type BoostSpec = {
  accountId: string;
  pageId: string;
  videoId: string;
  thumbnailUrl: string;
  /** The ad's text: the post's caption. */
  message: string;
  name: string;
  dailyMinor: number;
  startsAt: Date;
  endsAt: Date;
  targeting: Record<string, unknown>;
};

export type BoostIds = { campaignId?: string; adsetId?: string; creativeId?: string; adId?: string };

export class BoostError extends Error {
  constructor(
    message: string,
    readonly ids: BoostIds,
  ) {
    super(message);
  }
}

/**
 * Create the boost, all paused, then switch it on. If any step fails, the campaign is deleted
 * (best effort) and nothing runs: a paused campaign never spends.
 */
export async function createBoost(f: Fetch, cfg: MetaConfig, userToken: string, s: BoostSpec): Promise<Required<BoostIds>> {
  const ids: BoostIds = {};
  const act = `act_${s.accountId}`;
  try {
    ids.campaignId = (
      await graphPost<{ id: string }>(f, cfg, `${act}/campaigns`, userToken, {
        name: s.name,
        objective: "OUTCOME_ENGAGEMENT",
        buying_type: "AUCTION",
        // Housing ad. Meta's audience limits are required only for the US, Canada and Europe; the
        // targeting keeps the same fair limits anyway (boostTargeting).
        special_ad_categories: JSON.stringify(["HOUSING"]),
        special_ad_category_country: JSON.stringify(["PH"]),
        // Required since v24 when the budget is set on the ad set.
        is_adset_budget_sharing_enabled: "false",
        status: "PAUSED",
      })
    ).id;
    ids.adsetId = (
      await graphPost<{ id: string }>(f, cfg, `${act}/adsets`, userToken, {
        name: s.name,
        campaign_id: ids.campaignId,
        destination_type: "MESSENGER",
        optimization_goal: "CONVERSATIONS",
        billing_event: "IMPRESSIONS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        daily_budget: String(s.dailyMinor),
        promoted_object: JSON.stringify({ page_id: s.pageId }),
        targeting: JSON.stringify(s.targeting),
        start_time: s.startsAt.toISOString(),
        end_time: s.endsAt.toISOString(),
        status: "PAUSED",
      })
    ).id;
    ids.creativeId = (
      await graphPost<{ id: string }>(f, cfg, `${act}/adcreatives`, userToken, {
        name: s.name,
        object_story_spec: JSON.stringify({
          page_id: s.pageId,
          video_data: {
            video_id: s.videoId,
            image_url: s.thumbnailUrl,
            message: s.message,
            call_to_action: { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER" } },
          },
        }),
      })
    ).id;
    ids.adId = (
      await graphPost<{ id: string }>(f, cfg, `${act}/ads`, userToken, {
        name: s.name,
        adset_id: ids.adsetId,
        creative: JSON.stringify({ creative_id: ids.creativeId }),
        status: "PAUSED",
      })
    ).id;
    // Everything exists: switch on from the bottom up.
    for (const id of [ids.adId, ids.adsetId, ids.campaignId]) await graphPost(f, cfg, id, userToken, { status: "ACTIVE" });
    return ids as Required<BoostIds>;
  } catch (e) {
    if (ids.campaignId) {
      try {
        await graphPost(f, cfg, ids.campaignId, userToken, { status: "DELETED" });
      } catch {
        /* it stays paused, which spends nothing */
      }
    }
    throw new BoostError(e instanceof Error ? e.message : String(e), ids);
  }
}

/** Stop (pause) a running boost. */
export async function pauseCampaign(f: Fetch, cfg: MetaConfig, userToken: string, campaignId: string): Promise<void> {
  await graphPost(f, cfg, campaignId, userToken, { status: "PAUSED" });
}

/** What the boost has spent and brought in so far, from Meta. */
export async function campaignResults(f: Fetch, cfg: MetaConfig, userToken: string, campaignId: string): Promise<BoostResults> {
  const r = await graphGetFast<{ data?: unknown[] }>(f, cfg, `${campaignId}/insights`, userToken, {
    fields: "spend,impressions,reach,actions",
    date_preset: "maximum",
    action_breakdowns: "action_type",
  });
  return readBoostInsights(r.data?.[0]);
}

/** A Graph error that means the sign-in expired or lost the ad permissions. */
export const needsReconnect = (e: unknown) => e instanceof GraphError && e.tokenInvalid;

export { CHAT_ACTION };
