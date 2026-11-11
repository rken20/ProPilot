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

export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
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
