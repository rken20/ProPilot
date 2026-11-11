import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode, googleConfig, revokeToken, userEmail } from "@/lib/google";
import { GOOGLE_STATE_COOKIE, googleRedirectUri } from "@/lib/google-oauth";
import { createAdminClient } from "@/lib/supabase/admin";

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Google sends the user back here. Check the state, store the refresh token encrypted. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const back = new URL("/app/integrations", request.nextUrl.origin);
  const fail = (notice: string) => {
    back.searchParams.set("notice", notice);
    return NextResponse.redirect(back);
  };

  const jar = await cookies();
  const saved = jar.get(GOOGLE_STATE_COOKIE)?.value ?? "";
  jar.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/google" });
  const [state, uid] = saved.split(".");
  const got = request.nextUrl.searchParams.get("state") ?? "";
  if (!state || uid !== user.id || !sameString(state, got)) return fail("google-failed");
  if (request.nextUrl.searchParams.get("error")) return fail("google-cancelled");

  const code = request.nextUrl.searchParams.get("code");
  const cfg = googleConfig();
  const admin = createAdminClient();
  if (!code || !cfg || !admin) return fail("google-failed");

  try {
    const tokens = await exchangeCode(fetch, cfg, code, await googleRedirectUri());
    if (!tokens.refresh_token) return fail("google-no-refresh");
    const { email } = await userEmail(fetch, tokens.access_token);
    const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);

    const { data: previous } = await admin.from("google_connections").select("calendar_id, google_email").eq("user_id", user.id).maybeSingle();
    const { error } = await admin.from("google_connections").upsert({
      user_id: user.id,
      google_email: email,
      refresh_token_enc: encryptSecret(tokens.refresh_token),
      scopes,
      // A different Google account means a different calendar.
      calendar_id: previous && previous.google_email === email ? previous.calendar_id : null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      await revokeToken(fetch, tokens.refresh_token);
      return fail("google-failed");
    }
    back.searchParams.set("notice", "google-connected");
    return NextResponse.redirect(back);
  } catch (e) {
    console.error("[google] callback failed:", e instanceof Error ? e.message : String(e));
    return fail("google-failed");
  }
}
