import type { ZodError } from "zod";

/** Shape returned by every form Server Action, consumed with useActionState. */
export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, string>;
};

export const initialFormState: FormState = {};

/** The shared form rules write their messages in English; these are the same messages in Taglish. */
const FIELD_ERRORS_TL: Record<string, string> = {
  "Enter a mobile number, e.g. 0917 123 4567": "Maglagay ng mobile number, hal. 0917 123 4567",
  "Enter a valid email address": "Maglagay ng valid na email address",
  "Enter your full name": "Ilagay ang buong pangalan mo",
  "Enter your name": "Ilagay ang pangalan mo",
  "Enter your password": "Ilagay ang password mo",
  "Pick a date": "Pumili ng date",
  "Use at least 10 characters": "Gumamit ng hindi bababa sa 10 characters",
  "Use at most 128 characters": "Gumamit ng hanggang 128 characters lang",
};

/** One message per field. Pass `say` to get the business's (or the device's) language. */
export function fieldErrorsFrom(error: ZodError, say?: (english: string, taglish: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = say ? say(issue.message, FIELD_ERRORS_TL[issue.message] ?? issue.message) : issue.message;
  }
  return out;
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Only allow redirects to paths on this site (no open redirects). Browsers
 * treat "/\\host", tabs and newlines as host separators, so the value is
 * resolved against a placeholder origin and must stay on it.
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || next[0] !== "/" || /[\\\s]/.test(next) || next.startsWith("//")) return fallback;
  try {
    const base = "https://proPilot.invalid";
    const url = new URL(next, base);
    if (url.origin !== new URL(base).origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
