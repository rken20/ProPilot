import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getProfile, requireUser } from "@/lib/auth";
import { authUrl, googleConfig } from "@/lib/google";
import { GOOGLE_STATE_COOKIE, googleRedirectUri, missingGoogleSettings } from "@/lib/google-oauth";

/** Start "Connect Google": a state cookie against forgery, then Google's consent screen. */
export async function GET(request: NextRequest) {
  // Start on the registered address, so the state cookie and the callback share a host.
  const pinned = process.env.GOOGLE_REDIRECT_ORIGIN?.replace(/\/$/, "");
  if (pinned && pinned !== request.nextUrl.origin) {
    return NextResponse.redirect(new URL("/api/google/connect", pinned));
  }
  const user = await requireUser();
  const profile = await getProfile();
  const back = new URL("/app/integrations", request.nextUrl.origin);
  const cfg = googleConfig();
  if (!cfg || missingGoogleSettings().length || profile?.account_type === "buyer") {
    back.searchParams.set("notice", "google-not-ready");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(GOOGLE_STATE_COOKIE, `${state}.${user.id}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return NextResponse.redirect(authUrl(cfg.clientId, await googleRedirectUri(), state, user.email ?? undefined));
}
