import { NextResponse, type NextRequest } from "next/server";
import { getOrigin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * The welcome screen's choice (buyer or agent). A plain form POST answered with
 * a 303 redirect, so the browser itself moves to the next page. Only same-site
 * posts are accepted.
 */
export async function POST(request: NextRequest) {
  const origin = await getOrigin();
  const go = (path: string) => NextResponse.redirect(new URL(path, origin), { status: 303 });
  const from = request.headers.get("origin");
  if (from && from !== origin && from !== request.nextUrl.origin) return go("/welcome");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return go("/login");

  const type = String((await request.formData()).get("type") ?? "");
  if (type !== "buyer" && type !== "agent") return go("/welcome");
  const { error } = await supabase.rpc("choose_account_type", { p_type: type });
  if (error) {
    console.error("[welcome] choose_account_type failed:", error.message);
    return go("/welcome?error=1");
  }
  return go(type === "buyer" ? "/buyer" : "/onboarding");
}
