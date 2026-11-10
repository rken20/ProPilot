"use server";

import { redirect } from "next/navigation";
import { emailSchema, passwordSchema, signInSchema, signUpSchema } from "@propilot/shared";
import { getOrigin } from "@/lib/auth";
import { fieldErrorsFrom, safeNext, str, type FormState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    fullName: str(form, "fullName"),
    email: str(form, "email"),
    password: str(form, "password"),
    accountType: str(form, "accountType") === "buyer" ? "buyer" : "agent",
  });
  const data = { fullName: str(form, "fullName"), email: str(form, "email") };
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), data };

  const next = safeNext(str(form, "next"), parsed.data.accountType === "buyer" ? "/buyer" : "/onboarding");
  const supabase = await createClient();
  const { data: result, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, account_type: parsed.data.accountType },
      emailRedirectTo: `${await getOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: friendlyAuthError(error.message), data };

  // If email confirmation is turned off in Supabase, the user is signed in already.
  if (result.session) redirect(next);
  return {
    ok: true,
    message: `We sent a confirmation link to ${parsed.data.email}. Open it on this device to finish signing up.`,
  };
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: str(form, "email"), password: str(form, "password") });
  const data = { email: str(form, "email") };
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), data };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const message = /confirm/i.test(error.message)
      ? "Please confirm your email first. Check your inbox for the link."
      : "Email or password is incorrect.";
    return { error: message, data };
  }
  redirect(safeNext(str(form, "next"), "/start"));
}

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(str(form, "email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]!.message }, data: { email: str(form, "email") } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error && /rate limit/i.test(error.message)) return { error: friendlyAuthError(error.message), data: { email: parsed.data } };
  // Same answer whether or not the account exists, so emails can't be probed.
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = str(form, "password");
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0]!.message } };
  if (password !== str(form, "confirm")) return { fieldErrors: { confirm: "Passwords don't match" } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: error.message };
  redirect("/app?notice=password-updated");
}

/** Turn Supabase auth errors into plain guidance. */
function friendlyAuthError(message: string): string {
  if (/rate limit/i.test(message)) {
    return "We're sending too many emails right now. Please try again in about an hour.";
  }
  if (/already registered|already exists/i.test(message)) {
    return "An account with this email already exists. Log in instead, or use a different email.";
  }
  if (/password/i.test(message) && /weak|short|least/i.test(message)) {
    return "Choose a stronger password: at least 10 characters.";
  }
  return "Couldn't create your account. Please check your details and try again.";
}
