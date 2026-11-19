/**
 * Plan rules that don't need the database, shared by the server and the
 * Billing page. Prices and limits themselves live in the `plans` and
 * `plan_entitlements` tables.
 */

export const FREE_PLAN = "free";
export const PAID_PLANS = ["basic"] as const;

/** GCash reference numbers are 13 digits. People often type them with spaces. */
export function cleanGcashReference(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^[0-9]{13}$/.test(digits) ? digits : null;
}

/** The plan a business is on: the paid plan while its period lasts, else Free. */
export function effectivePlanCode(sub: { code: string; current_period_end: string } | null, now: Date): string {
  if (!sub) return FREE_PLAN;
  return new Date(sub.current_period_end) > now ? sub.code : FREE_PLAN;
}

export function daysLeft(periodEnd: string | null, now: Date): number | null {
  if (!periodEnd) return null;
  return Math.max(0, Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86_400_000));
}

export const UPGRADE_MESSAGE = "AI features are part of the Basic plan. An owner can upgrade in Billing.";
export const BUYER_UPGRADE_MESSAGE = "AI answers and AI search are part of the Basic plan. You can upgrade in My plan.";

/** What each plan says to buyers on My plan. */
export const BUYER_PLAN_COPY: Record<string, { tagline: string; includes: string[]; excludes?: string }> = {
  free: {
    tagline: "Browse and contact agents, free.",
    includes: ["Browse and save Home Finder listings", "Message agents and request viewings", "My search: tell agents what you want"],
    excludes: "No AI: no AI answers on listings, no AI search of other sites, and agents reply in person.",
  },
  basic: {
    tagline: "AI help while you look for a home",
    includes: [
      "Everything in Free",
      "Ask the AI about any listing whose agent has AI on",
      "AI search of other property sites",
      "Instant AI replies when you message an agent",
      "Alerts when a matching listing is posted (coming soon)",
    ],
  },
};

/** What each plan says on the Billing page. */
export const PLAN_COPY: Record<string, { tagline: string; includes: string[]; excludes?: string }> = {
  free: {
    tagline: "For getting started: list and follow up, without AI.",
    includes: [
      "Property listing management",
      "Buyer inquiries and viewing requests",
      "Pipeline and Messages inbox",
      "Listing reports",
    ],
    excludes: "No AI features: no AI chat replies, lead scoring, Buyer Finder or AI writing.",
  },
  basic: {
    tagline: "Para sa individual property owners",
    includes: [
      "Everything in Free",
      "Up to 5 AI-found potential buyers a month (Buyer Finder)",
      "Basic buyer matching and lead scoring",
      "AI replies in Home Finder chat and Messenger",
      "AI-written listing descriptions and captions",
      "Ask Home Finder and the reply helper",
    ],
    excludes: "Walay AI video creation. Limited buyer finder.",
  },
};
