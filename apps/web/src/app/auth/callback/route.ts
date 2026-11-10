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
      // Google sign-ups: apply the buyer/agent choice made before leaving for Google.
      // The database ignores this if the account already has a type.
      const jar = await cookies();
      const as = jar.get("pp_signup_as")?.value;
      if (as === "buyer" || as === "agent") {
        await supabase.rpc("choose_account_type", { p_type: as });
        jar.delete("pp_signup_as");
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL("/login?notice=link-expired", origin));
}
