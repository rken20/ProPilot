"use server";

import type { Say } from "@/lib/lang";
import { siteSay } from "@/lib/lang-server";
import { redirect } from "next/navigation";
import { emailSchema, passwordSchema, signInSchema, signUpSchema } from "@propilot/shared";
import { getOrigin } from "@/lib/auth";
import { isGoogleEnabled } from "@/lib/auth-providers";
import { fieldErrorsFrom, safeNext, str, type FormState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const say = await siteSay();
  const parsed = signUpSchema.safeParse({
    fullName: str(form, "fullName"),
    email: str(form, "email"),
    password: str(form, "password"),
    accountType: "agent",
  });
  const data = { fullName: str(form, "fullName"), email: str(form, "email") };
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error, say), data };

  const next = safeNext(str(form, "next"), "/onboarding");
  const supabase = await createClient();
  const { data: result, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, account_type: "agent" },
      emailRedirectTo: `${await getOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: friendlyAuthError(error.message, say), data };

  // If email confirmation is turned off in Supabase, the user is signed in already.
  if (result.session) redirect(next);
  return {
    ok: true,
    message: say(`We sent a confirmation link to ${parsed.data.email}. Open it on this device to finish signing up.`, `Nag-send kami ng confirmation link sa ${parsed.data.email}. Buksan ito sa device na ito para matapos ang pag-sign up.`),
  };
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const say = await siteSay();
  const parsed = signInSchema.safeParse({ email: str(form, "email"), password: str(form, "password") });
  const data = { email: str(form, "email") };
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error, say), data };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const message = /confirm/i.test(error.message)
      ? say("Please confirm your email first. Check your inbox for the link.", "I-confirm muna ang email mo. I-check ang inbox mo para sa link.")
      : say("Email or password is incorrect.", "Mali ang email o password.");
    return { error: message, data };
  }
  redirect(safeNext(str(form, "next"), "/start"));
}

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const say = await siteSay();
  const parsed = emailSchema.safeParse(str(form, "email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]!.message }, data: { email: str(form, "email") } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error && /rate limit/i.test(error.message)) return { error: friendlyAuthError(error.message, say), data: { email: parsed.data } };
  // Same answer whether or not the account exists, so emails can't be probed.
  return { ok: true, message: say("If an account exists for that email, a reset link is on its way.", "Kung may account para sa email na iyan, parating na ang reset link.") };
}

export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const say = await siteSay();
  const password = str(form, "password");
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0]!.message } };
  if (password !== str(form, "confirm")) return { fieldErrors: { confirm: say("Passwords don't match", "Hindi magkapareho ang passwords") } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: error.message };
  redirect("/app?notice=password-updated");
}

/** Turn Supabase auth errors into plain guidance. */
function friendlyAuthError(message: string, say: Say): string {
  if (/rate limit/i.test(message)) {
    return say("We're sending too many emails right now. Please try again in about an hour.", "Masyadong marami ang ini-email namin ngayon. Paki-try ulit pagkalipas ng mga isang oras.");
  }
  if (/already registered|already exists/i.test(message)) {
    return say("An account with this email already exists. Log in instead, or use a different email.", "May account na para sa email na ito. Mag-log in na lang, o gumamit ng ibang email.");
  }
  if (/password/i.test(message) && /weak|short|least/i.test(message)) {
    return say("Choose a stronger password: at least 10 characters.", "Pumili ng mas matibay na password: hindi bababa sa 10 characters.");
  }
  return say("Couldn't create your account. Please check your details and try again.", "Hindi nagawa ang account mo. I-check ang details mo at subukan ulit.");
}

/** Start Google sign-in. Every account is an owner or agent account. */
export async function signInWithGoogle(form: FormData) {
  const next = str(form, "next");
  if (!(await isGoogleEnabled())) redirect("/login?notice=google-unavailable");
  const supabase = await createClient();
  const callback = new URL(`${await getOrigin()}/auth/callback`);
  if (next) callback.searchParams.set("next", safeNext(next));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) redirect("/login?notice=google-unavailable");
  redirect(data.url);
}
