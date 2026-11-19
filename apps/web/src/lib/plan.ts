import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectivePlanCode, FREE_PLAN } from "@/lib/plan-rules";

export type PlanInfo = {
  code: string;
  name: string;
  /** Whether AI features are included. */
  ai: boolean;
  /** Home Finder AI buyers per month; null = unlimited, 0 = not included. */
  homeFinderBuyers: number | null;
  /** When the paid period ends (null on Free). */
  periodEnd: string | null;
};

const FREE: PlanInfo = { code: FREE_PLAN, name: "Free", ai: false, homeFinderBuyers: 0, periodEnd: null };

/**
 * The plan a business is on right now. Read with the service role so it works
 * for buyers, webhooks and background jobs too; only `businessId`'s rows are read.
 * Cached for the length of one request.
 */
export const businessPlan = cache(async (businessId: string): Promise<PlanInfo> => {
  const admin = createAdminClient();
  if (!admin) return FREE;
  const { data: sub } = await admin
    .from("subscriptions")
    .select("current_period_end, plans(code, name)")
    .eq("business_id", businessId)
    .maybeSingle();
  const plan = (sub?.plans ?? null) as { code: string; name: string } | null;
  const code = effectivePlanCode(sub && plan ? { code: plan.code, current_period_end: sub.current_period_end as string } : null, new Date());
  if (code === FREE_PLAN || !plan) return FREE;

  const { data: rows } = await admin
    .from("plan_entitlements")
    .select("feature_key, limit, plans!inner(code)")
    .eq("plans.code", code);
  const limit = (key: string) => {
    const row = (rows ?? []).find((r) => r.feature_key === key);
    return row ? (row.limit as number | null) : 0;
  };
  const ai = limit("ai");
  return { code, name: plan.name, ai: ai === null || ai > 0, homeFinderBuyers: limit("home_finder_buyers"), periodEnd: sub!.current_period_end as string };
});

/** AI is on for a business when the AI key is set and its plan includes AI. */
export async function aiEnabled(businessId: string): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  return (await businessPlan(businessId)).ai;
}

/** Whether a public listing's business has AI, for buyer-facing AI on that listing. */
export async function listingAiEnabled(propertyId: string): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY || !/^[0-9a-f-]{36}$/i.test(propertyId)) return false;
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("properties").select("business_id").eq("id", propertyId).maybeSingle();
  return data ? aiEnabled(data.business_id as string) : false;
}
