/**
 * Plan rules that don't need the database, shared by the server and the
 * Billing page. Prices and limits themselves live in the `plans` and
 * `plan_entitlements` tables.
 */

import type { Lang, Say } from "./lang";

export const FREE_PLAN = "free";

/** The Follow-up Assistant is part of Pro and Agency (owner's decision, 27 Nov 2026). */
export const FOLLOW_UP_PLANS: readonly string[] = ["pro", "agency"];
export const followUpsIncluded = (planCode: string) => FOLLOW_UP_PLANS.includes(planCode);
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

/** A payment covers 1 to 12 months (the database refuses anything else). */
export const MAX_MONTHS = 12;
/** The lengths offered as one-tap choices; any whole number up to MAX_MONTHS can be picked. */
export const QUICK_MONTHS = [1, 3, 6, 12] as const;
export const validMonths = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_MONTHS;

/** `months` later on the calendar. A day the month doesn't have becomes its last day, as the database does. */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d;
}

/**
 * What a payment for `months` of `planCode` would buy if it were confirmed at
 * `now`, by the same rule the database applies: renewing the plan you are on
 * adds the months to its end; anything else starts when it is confirmed.
 */
export function paidUntil(now: Date, current: { code: string; periodEnd: string | null }, planCode: string, months: number): { until: Date; addsOn: boolean } {
  const end = current.periodEnd ? new Date(current.periodEnd) : null;
  const addsOn = Boolean(end && current.code === planCode && end > now);
  return { until: addMonths(addsOn ? end! : now, months), addsOn };
}

export function daysLeft(periodEnd: string | null, now: Date): number | null {
  if (!periodEnd) return null;
  return Math.max(0, Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86_400_000));
}

export const UPGRADE_MESSAGE = "AI features are part of the Basic plan. An owner can upgrade in Billing.";
const UPGRADE_MESSAGE_TL = "Kasama sa Basic plan ang AI features. Pwedeng mag-upgrade ang owner sa Billing.";

/** The "this needs a paid plan" message, in the business's language. */
export function upgradeMessage(say: Say): string {
  return say(UPGRADE_MESSAGE, UPGRADE_MESSAGE_TL);
}

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
    tagline: "For individual property owners",
    includes: [
      "Everything in Free, for 2 team members",
      "Buyer Finder: 5 AI-found potential buyers a month",
      "Property matcher and lead scoring",
      "AI replies in Messenger and chats, up to 3,000 a month",
      "AI-written listing descriptions and captions",
      "Ask MyHomeSeller and the reply helper",
    ],
    excludes: "No Video Ad Maker or Follow-up Assistant. Limited Buyer Finder.",
  },
  pro: {
    tagline: "For agents",
    includes: [
      "Everything in Basic, for 5 team members",
      "Buyer Finder: 20 AI-found potential buyers a month",
      "Up to 10,000 AI replies a month",
      "AI negotiation: the chat negotiates down to a lowest price you set, and closes deals at a price you pre-approve",
      "Video Ad Maker: 10 video ads a month from your listing photos, with AI-picked templates, text and music",
      "Follow-up Assistant: quiet leads listed for you, with a message written and ready to send",
    ],
  },
  agency: {
    tagline: "For brokerages and teams",
    includes: [
      "Everything in Pro, for 15 team members",
      "Buyer Finder: 60 AI-found potential buyers a month",
      "Up to 25,000 AI replies a month",
      "Pricing Advisor: 20 AI price checks a month, with comparable listings",
      "Video Ad Maker: 30 video ads a month from your listing photos, with AI-picked templates, text and music",
      "Follow-up Assistant: quiet leads listed for you, with a message written and ready to send",
    ],
  },
};

/** The same, in Taglish. Feature names and numbers match PLAN_COPY line for line. */
const PLAN_COPY_TL: typeof PLAN_COPY = {
  free: {
    tagline: "Para masubukan ang MyHomeSeller: ikaw ang maglilista at magfa-follow up.",
    includes: ["1 team member", "Listings na may public page na pwedeng i-share", "Inquiries, Leads at Messages inbox", "Reports at follow-up reminders"],
    excludes: "Walang AI: walang AI replies, lead scoring, matching, Buyer Finder o AI writing.",
  },
  basic: {
    tagline: "Para sa individual property owners",
    includes: [
      "Lahat ng nasa Free, para sa 2 team members",
      "Buyer Finder: 5 potential buyers na hanap ng AI kada buwan",
      "Property matcher at lead scoring",
      "AI replies sa Messenger at chats, hanggang 3,000 kada buwan",
      "Listing descriptions at captions na sulat ng AI",
      "Ask MyHomeSeller at ang reply helper",
    ],
    excludes: "Walang Video Ad Maker o Follow-up Assistant. Limited ang Buyer Finder.",
  },
  pro: {
    tagline: "Para sa mga agent",
    includes: [
      "Lahat ng nasa Basic, para sa 5 team members",
      "Buyer Finder: 20 potential buyers na hanap ng AI kada buwan",
      "Hanggang 10,000 AI replies kada buwan",
      "AI negotiation: nakikipag-negotiate ang chat hanggang sa lowest price na sine-set mo, at nagko-close ng deal sa presyong pre-approved mo",
      "Video Ad Maker: 10 video ads kada buwan mula sa listing photos mo, na AI ang pumipili ng template, text at music",
      "Follow-up Assistant: nakalista ang mga tahimik na lead, may message na nakasulat at ready nang i-send",
    ],
  },
  agency: {
    tagline: "Para sa mga brokerage at team",
    includes: [
      "Lahat ng nasa Pro, para sa 15 team members",
      "Buyer Finder: 60 potential buyers na hanap ng AI kada buwan",
      "Hanggang 25,000 AI replies kada buwan",
      "Pricing Advisor: 20 AI price checks kada buwan, na may comparable listings",
      "Video Ad Maker: 30 video ads kada buwan mula sa listing photos mo, na AI ang pumipili ng template, text at music",
      "Follow-up Assistant: nakalista ang mga tahimik na lead, may message na nakasulat at ready nang i-send",
    ],
  },
};

/** What each plan says on the Billing page, in the business's language. */
export function planCopy(lang: Lang): typeof PLAN_COPY {
  return lang === "english" ? PLAN_COPY : PLAN_COPY_TL;
}
