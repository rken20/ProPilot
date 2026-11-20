import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for links in Supabase emails (confirm signup, reset password,
 * magic link). Exchanges the one-time code for a session, then continues.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/start");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Every account is an owner or agent account. Older Google sign-ups that
      // never picked a type are marked as agents (the database ignores a second choice).
      await supabase.rpc("choose_account_type", { p_type: "agent" });
      (await cookies()).delete("pp_signup_as");
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL("/login?notice=link-expired", origin));
}
