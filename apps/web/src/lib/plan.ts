import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectivePlanCode, FREE_PLAN } from "@/lib/plan-rules";

export type PlanInfo = {
  code: string;
  name: string;
  /** Whether AI features are included. */
  ai: boolean;
  /** Buyer Finder buyers per month; null = unlimited, 0 = not included. */
  homeFinderBuyers: number | null;
  /** People in the business, owner and pending invites included; null = unlimited. */
  teamMembers: number | null;
  /** AI chat and Messenger replies a month; null = unlimited, 0 = none. */
  aiReplies: number | null;
  /** Whether the AI chat may negotiate offers (the owner still confirms). */
  negotiation: boolean;
  /** Pricing Advisor price checks a month; null = unlimited, 0 = not included. */
  priceChecks: number | null;
  /** Video Ad Maker videos a month; null = unlimited, 0 = not included. */
  videoAds: number | null;
  /** When the paid period ends (null on Free). */
  periodEnd: string | null;
};

const FREE: PlanInfo = { code: FREE_PLAN, name: "Free", ai: false, homeFinderBuyers: 0, teamMembers: 1, aiReplies: 0, negotiation: false, priceChecks: 0, videoAds: 0, periodEnd: null };

/** Plan and limits come back in one query (the subscription with its plan and the plan's limits). */
const SUB_SELECT = "current_period_end, plans(code, name, plan_entitlements(feature_key, limit)), businesses(restricted_at)";

function planFrom(sub: { current_period_end: unknown; plans: unknown; businesses?: unknown } | null): PlanInfo {
  // A business the app admin has restricted gets nothing a paid plan adds (the AI stops replying) until it is lifted.
  if ((sub?.businesses as { restricted_at: string | null } | null | undefined)?.restricted_at) return FREE;
  const plan = (sub?.plans ?? null) as { code: string; name: string; plan_entitlements?: Array<{ feature_key: string; limit: number | null }> } | null;
  const code = effectivePlanCode(sub && plan ? { code: plan.code, current_period_end: sub.current_period_end as string } : null, new Date());
  if (code === FREE_PLAN || !plan) return FREE;
  const rows = plan.plan_entitlements ?? [];
  // No row means "not included", except for limits added later, where it means "no limit".
  const limit = (key: string, missing: number | null = 0) => {
    const row = rows.find((r) => r.feature_key === key);
    return row ? row.limit : missing;
  };
  const ai = limit("ai");
  const negotiation = limit("ai_negotiation");
  return {
    code,
    name: plan.name,
    ai: ai === null || ai > 0,
    homeFinderBuyers: limit("home_finder_buyers"),
    teamMembers: limit("team_members", null),
    aiReplies: limit("ai_replies", null),
    negotiation: negotiation === null || negotiation > 0,
    priceChecks: limit("ai_price_checks"),
    videoAds: limit("ai_video_generations"),
    periodEnd: sub!.current_period_end as string,
  };
}

/**
 * The plan a business is on right now. Read with the service role so it works
 * for webhooks and background jobs too; only `businessId`'s rows are read.
 * Cached for the length of one request.
 */
export const businessPlan = cache(async (businessId: string): Promise<PlanInfo> => {
  const admin = createAdminClient();
  if (!admin) return FREE;
  const { data: sub } = await admin.from("subscriptions").select(SUB_SELECT).eq("business_id", businessId).maybeSingle();
  return planFrom(sub);
});

/** AI is on for a business when the AI key is set and its plan includes AI. */
export async function aiEnabled(businessId: string): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  return (await businessPlan(businessId)).ai;
}
