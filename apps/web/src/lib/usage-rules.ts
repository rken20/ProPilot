/**
 * The monthly AI allowances a plan includes, and when to tell people they're
 * running low. Pure, so the app, the daily email and the tests share one rule.
 */
import type { Say } from "./lang";

/** From this share of an allowance on, people are told it's running low. */
export const LOW_AT = 0.8;

export type UsageKey = "replies" | "finder" | "priceChecks" | "videoAds";
export type UsageLevel = "ok" | "low" | "out";
export type UsageItem = { key: UsageKey; used: number; limit: number; level: UsageLevel };

export const USAGE_LABEL: Record<UsageKey, { name: string; unit: string; whenOut: string; whenOutTl: string }> = {
  replies: { name: "AI replies", unit: "replies", whenOut: "New buyer messages wait for a person until then.", whenOutTl: "Hanggang doon, tao muna ang sasagot sa mga bagong buyer message." },
  finder: { name: "Buyer Finder", unit: "AI-found buyers", whenOut: "Buyer Finder adds no more buyers until then.", whenOutTl: "Hanggang doon, wala munang madadagdag na buyer ang Buyer Finder." },
  priceChecks: { name: "Pricing Advisor", unit: "price checks", whenOut: "No more price checks can run until then.", whenOutTl: "Hanggang doon, wala munang price check na magagawa." },
  videoAds: { name: "Video Ad Maker", unit: "video ads", whenOut: "No more video ads can be made until then.", whenOutTl: "Hanggang doon, wala munang video ad na magagawa." },
};

export function usageLevel(used: number, limit: number): UsageLevel {
  if (used >= limit) return "out";
  return used >= Math.ceil(limit * LOW_AT) ? "low" : "ok";
}

type Limits = { ai: boolean; aiReplies: number | null; homeFinderBuyers: number | null; priceChecks: number | null; videoAds?: number | null };

/** One item per allowance the plan includes with a limit. Unlimited (null) and not included (0) are left out. */
export function usageItems(plan: Limits, used: Record<UsageKey, number>): UsageItem[] {
  if (!plan.ai) return [];
  const limits: Array<[UsageKey, number | null]> = [
    ["replies", plan.aiReplies],
    ["finder", plan.homeFinderBuyers],
    ["priceChecks", plan.priceChecks],
    ["videoAds", plan.videoAds ?? 0],
  ];
  return limits.flatMap(([key, limit]) => (limit === null || limit <= 0 ? [] : [{ key, used: used[key], limit, level: usageLevel(used[key], limit) }]));
}

/** The plan to suggest when an allowance runs low; null on the top plan. */
export function nextPlan(code: string): { code: string; name: string } | null {
  if (code === "basic") return { code: "pro", name: "Pro" };
  if (code === "pro") return { code: "agency", name: "Agency" };
  return null;
}

/** A level reached since `before`, for the once-only email: "low" at 80%, "out" at the limit. */
export function crossed(before: number, now: number, limit: number): "low" | "out" | null {
  const was = usageLevel(before, limit);
  const is = usageLevel(now, limit);
  if (is === was || is === "ok") return null;
  return is;
}

const n = (v: number) => v.toLocaleString("en-PH");

/** One sentence for a notice: what is low or used up. In English unless given the business's `say`. */
export function usageSentence(item: UsageItem, say: Say = (english) => english): string {
  const label = USAGE_LABEL[item.key];
  return item.level === "out"
    ? say(
        `${label.name}: all ${n(item.limit)} ${label.unit} for this month are used. ${label.whenOut}`,
        `${label.name}: nagamit na lahat ng ${n(item.limit)} ${label.unit} ngayong buwan. ${label.whenOutTl}`,
      )
    : say(
        `${label.name}: ${n(item.used)} of ${n(item.limit)} ${label.unit} used this month, ${n(item.limit - item.used)} left.`,
        `${label.name}: ${n(item.used)} sa ${n(item.limit)} ${label.unit} na ang nagamit ngayong buwan, ${n(item.limit - item.used)} na lang ang natitira.`,
      );
}
