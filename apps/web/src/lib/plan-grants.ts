/**
 * Plans given to beta testers by email: reading the emails a super admin
 * typed, and wording what happened to each. No server code here, so it can be
 * unit-tested.
 */

export const MAX_GRANT_EMAILS = 25;
export const GRANT_MONTHS = [1, 3, 6, 12] as const;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The emails in a pasted list (commas, spaces, semicolons or new lines between them), lower-cased, each once. */
export function parseEmails(text: string): {
  emails: string[];
  invalid: string[];
  tooMany: boolean;
} {
  const seen = new Set<string>();
  const emails: string[] = [];
  const broken: string[] = [];
  const words: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    // People paste "Name <a@b.com>" and trailing dots from sentences.
    const item = raw.replace(/^[<("']+|[>)"'.]+$/g, "").toLowerCase();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    if (EMAIL.test(item) && item.length <= 254) emails.push(item);
    else (item.includes("@") ? broken : words).push(item.slice(0, 80));
  }
  // Words beside real emails are names from a pasted list; with no email at all they are the mistake.
  const invalid = [...broken, ...(emails.length ? [] : words)];
  return {
    emails: emails.slice(0, MAX_GRANT_EMAILS),
    invalid: invalid.slice(0, 10),
    tooMany: emails.length > MAX_GRANT_EMAILS,
  };
}

export type GrantStatus =
  "applied" | "waiting_business" | "waiting_signup" | "failed";
export type GrantResult = {
  email: string;
  status: GrantStatus;
  business?: string | null;
  until?: string | null;
};

/** One line for the super admin on what happened to an email. In English unless given `say`. */
export function grantLine(
  r: GrantResult,
  plan: string,
  say: (english: string, taglish: string) => string = (english) => english,
): string {
  switch (r.status) {
    case "applied":
      return say(
        `${plan} is on for ${r.business ?? "their business"}${r.until ? `, until ${r.until}` : ""}.`,
        `Naka-on na ang ${plan} para sa ${r.business ?? "business nila"}${r.until ? `, hanggang ${r.until}` : ""}.`,
      );
    case "waiting_business":
      return say(
        `Has an account but no business of their own yet. ${plan} turns on when they set one up.`,
        `May account na pero wala pang sariling business. Mao-on ang ${plan} kapag nag-set up sila.`,
      );
    case "waiting_signup":
      return say(
        `Hasn't signed up yet. ${plan} turns on when they sign up with this email and set up their business.`,
        `Hindi pa nag-sign up. Mao-on ang ${plan} kapag nag-sign up sila gamit ang email na ito at nag-set up ng business.`,
      );
    default:
      return say(
        "Couldn't give the plan. Try again.",
        "Hindi naibigay ang plan. Subukan ulit.",
      );
  }
}
