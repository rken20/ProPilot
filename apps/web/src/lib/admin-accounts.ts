/**
 * The app admin's Accounts screen: the shapes it shows and the small rules that
 * don't need the database, so they can be unit-tested.
 */

export type AccountBusiness = {
  id: string;
  name: string;
  role: string;
  member_status: string;
  restricted: boolean;
  plan_code: string;
  plan_name: string;
  period_end: string | null;
  listings: number;
  /** Nobody else owns it, so deleting this person deletes the business too. */
  sole_owner: boolean;
};

export type Account = {
  user_id: string;
  email: string | null;
  full_name: string;
  status: string;
  is_superadmin: boolean;
  signed_up: string;
  last_sign_in: string | null;
  businesses: AccountBusiness[];
};

export type AdminCounts = {
  people: number;
  new_people_7d: number;
  signed_in_7d: number;
  restricted: number;
  businesses: number;
  listings: number;
  public_listings: number;
  plans: Record<string, number>;
};

const manila = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A moment as a calendar date in Manila, "2026-11-24": what a date field holds. */
export function manilaDate(at: Date): string {
  return manila.format(at);
}

/** The date a plan change form starts on: the day the current plan ends, or a month from today. */
export function defaultUntil(periodEnd: string | null, now: Date): string {
  if (periodEnd && new Date(periodEnd) > now)
    return manilaDate(new Date(periodEnd));
  return manilaDate(new Date(now.getTime() + 30 * 86_400_000));
}

/** A typed end date the database will take: a real date, after today, within five years. */
export function validUntil(value: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value)
    return false;
  const today = manilaDate(now);
  const limit = manilaDate(new Date(now.getTime() + 5 * 365 * 86_400_000));
  return value >= today && value <= limit;
}

/** People paying, or on a plan that was given: every business not on Free. */
export function paidBusinesses(plans: Record<string, number>): number {
  return Object.entries(plans).reduce(
    (n, [code, count]) => (code === "free" ? n : n + count),
    0,
  );
}

/** What the screen says after an action, by the notice in the address. */
export const ACCOUNT_NOTICES: Record<
  string,
  { tone: "success" | "error"; text: string }
> = {
  "plan-saved": { tone: "success", text: "Plan changed." },
  "plan-failed": {
    tone: "error",
    text: "Couldn't change the plan. Check the plan and the end date, then try again.",
  },
  "bad-date": {
    tone: "error",
    text: "Choose an end date after today and within five years.",
  },
  restricted: {
    tone: "success",
    text: "Account restricted. They can't open their business, and a business only they own is off public pages.",
  },
  unrestricted: { tone: "success", text: "Restriction lifted." },
  "restrict-failed": {
    tone: "error",
    text: "Couldn't change the restriction. Try again.",
  },
  deleted: { tone: "success", text: "Account deleted." },
  "email-mismatch": {
    tone: "error",
    text: "The email you typed doesn't match the account, so nothing was deleted.",
  },
  "delete-failed": {
    tone: "error",
    text: "Couldn't delete the account. Nothing was removed.",
  },
  "signin-left": {
    tone: "error",
    text: "Their business data was deleted, but the sign-in itself couldn't be removed. Press Delete on the account again to finish.",
  },
  "files-left": {
    tone: "error",
    text: "Account deleted, but some photo files couldn't be removed from storage. They are no longer linked from anywhere.",
  },
  "not-allowed": {
    tone: "error",
    text: "That can't be done to your own account or another app admin's.",
  },
};
