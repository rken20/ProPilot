/**
 * Plan entitlements. Prices and limits live in the database (`plans`,
 * `plan_entitlements`) and are edited by Super Admin; nothing here hardcodes a
 * price. This file only defines the feature keys and the check logic.
 */

export const FEATURE_KEYS = [
  "seats",
  "properties",
  "facebook_pages",
  "chatbot_conversations",
  "ai_reports",
  "ai_video_generations",
  "ai_image_generations",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** A limit of `null` means unlimited; 0 means the feature is not included. */
export type Entitlements = Partial<Record<FeatureKey, number | null>>;

export type EntitlementCheck =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: "not_included" | "limit_reached"; limit: number };

export function checkEntitlement(
  entitlements: Entitlements,
  feature: FeatureKey,
  used: number,
  requested = 1,
): EntitlementCheck {
  if (!(feature in entitlements)) {
    return { allowed: false, reason: "not_included", limit: 0 };
  }
  const limit = entitlements[feature];
  if (limit === null || limit === undefined) {
    return { allowed: true, remaining: null };
  }
  if (limit === 0) {
    return { allowed: false, reason: "not_included", limit: 0 };
  }
  if (used + requested > limit) {
    return { allowed: false, reason: "limit_reached", limit };
  }
  return { allowed: true, remaining: limit - used - requested };
}

/** Subscription states. Only `trialing`, `active` and `grace` unlock paid features. */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "grace",
  "restricted",
  "canceled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function hasPaidAccess(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active" || status === "grace";
}
