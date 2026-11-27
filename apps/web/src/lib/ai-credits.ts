import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditFeature, CreditPack } from "./credit-rules";
import { manilaMonthStart } from "./matching";

/** AI credits the business can still use (expired ones don't count). */
export async function creditBalance(
  db: SupabaseClient,
  businessId: string,
): Promise<number> {
  const { data, error } = await db.rpc("ai_credit_balance", {
    p_business: businessId,
  });
  if (error) {
    console.error("[credits] balance:", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

/** Credits left and when the soonest of them expire, for Billing. Reads with the caller's access. */
export async function creditSummary(
  db: SupabaseClient,
  businessId: string,
): Promise<{
  left: number;
  nextExpiry: { at: string; credits: number } | null;
}> {
  const { data } = await db
    .from("ai_credit_lots")
    .select("remaining, expires_at")
    .eq("business_id", businessId)
    .gt("remaining", 0)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at")
    .limit(50);
  const lots = (data ?? []).map((l) => ({
    remaining: Number(l.remaining),
    at: l.expires_at as string,
  }));
  return {
    left: lots.reduce((sum, l) => sum + l.remaining, 0),
    nextExpiry: lots[0] ? { at: lots[0].at, credits: lots[0].remaining } : null,
  };
}

/** Ask MyHomeSeller questions asked this month (Manila calendar month), on the plan or with credits. */
export async function askUsedThisMonth(
  db: SupabaseClient,
  businessId: string,
): Promise<number> {
  const { count } = await db
    .from("ai_uses")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("feature", "ask")
    .gte("created_at", manilaMonthStart());
  return count ?? 0;
}

/**
 * Record one AI use with the service-role client, taking `credits` (0 = on the
 * plan's allowance). Returns false when the credits ran out in the meantime.
 */
export async function recordAiUse(
  admin: SupabaseClient,
  businessId: string,
  feature: CreditFeature,
  credits: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("record_ai_use", {
    p_business: businessId,
    p_feature: feature,
    p_credits: credits,
  });
  if (error) {
    console.error("[credits] record:", error.message);
    return false;
  }
  return Number(data) >= 0;
}

/** The packs on sale, cheapest first. */
export async function creditPacks(db: SupabaseClient): Promise<CreditPack[]> {
  const { data } = await db
    .from("credit_packs")
    .select("code, credits, price_minor, valid_months")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((p) => ({
    code: p.code as string,
    credits: Number(p.credits),
    priceMinor: Number(p.price_minor),
    validMonths: Number(p.valid_months),
  }));
}
