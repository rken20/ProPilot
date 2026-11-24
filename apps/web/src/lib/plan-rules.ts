/**
 * Plan rules that don't need the database, shared by the server and the
 * Billing page. Prices and limits themselves live in the `plans` and
 * `plan_entitlements` tables.
 */

export const FREE_PLAN = "free";
export const PAID_PLANS = ["basic", "pro", "agency"] as const;

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
    tagline: "For trying MyHomeSeller: list and follow up by hand.",
    includes: [
      "1 team member",
      "Listings with a public page to share",
      "Inquiries, Leads and Messages inbox",
      "Reports and follow-up reminders",
    ],
    excludes: "No AI: no AI replies, lead scoring, matching, Buyer Finder or AI writing.",
  },
  basic: {
    tagline: "Para sa individual property owners",
    includes: [
      "Everything in Free, for 2 team members",
      "Buyer Finder: 5 AI-found potential buyers a month",
      "Property matcher and lead scoring",
      "AI replies in Messenger and chats, up to 3,000 a month",
      "AI-written listing descriptions and captions",
      "Ask MyHomeSeller and the reply helper",
    ],
    excludes: "No Video Ad Maker. Limited Buyer Finder.",
  },
  pro: {
    tagline: "Para sa mga agent",
    includes: [
      "Everything in Basic, for 5 team members",
      "Buyer Finder: 20 AI-found potential buyers a month",
      "Up to 10,000 AI replies a month",
      "AI negotiation: the chat negotiates down to a lowest price you set, and closes deals at a price you pre-approve",
      "Video Ad Maker: 10 AI video ads a month from your photos (coming soon)",
    ],
  },
  agency: {
    tagline: "Para sa mga brokerage at team",
    includes: [
      "Everything in Pro, for 15 team members",
      "Buyer Finder: 60 AI-found potential buyers a month",
      "Up to 25,000 AI replies a month",
      "Pricing Advisor: 20 AI price checks a month, with comparable listings",
      "Video Ad Maker: 30 AI video ads a month from your photos (coming soon)",
    ],
  },
};
