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
    excludes: "No AI features: no AI chat replies, lead scoring, Home Finder AI or AI writing.",
  },
  basic: {
    tagline: "Para sa individual property owners",
    includes: [
      "Everything in Free",
      "Up to 5 AI-found potential buyers a month (Home Finder AI)",
      "Basic buyer matching and lead scoring",
      "AI replies in ProPilot chat and Messenger",
      "AI-written listing descriptions and captions",
      "Ask ProPilot and the reply helper",
    ],
    excludes: "Walay AI video creation. Limited buyer finder.",
  },
};
