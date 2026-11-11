import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { dialogUrl, metaConfig } from "@/lib/meta";
import { META_STATE_COOKIE, metaRedirectUri, missingMetaSettings } from "@/lib/meta-oauth";

/** Start "Connect Facebook Page": a state cookie against forgery, then Facebook's login dialog. */
export async function GET(request: NextRequest) {
  const pinned = process.env.META_REDIRECT_ORIGIN?.replace(/\/$/, "");
  if (pinned && pinned !== request.nextUrl.origin) {
    return NextResponse.redirect(new URL("/api/meta/connect", pinned));
  }
  const user = await requireUser();
  const biz = await requireBusiness();
  const back = new URL("/app/integrations", request.nextUrl.origin);
  if (!can(biz.role, "facebook.connect")) {
    back.searchParams.set("notice", "not-allowed");
    return NextResponse.redirect(back);
  }
  const cfg = metaConfig();
  if (!cfg || missingMetaSettings().length) {
    back.searchParams.set("notice", "facebook-not-ready");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(24).toString("base64url");
  // The business is fixed now, so the callback can't be pointed at another one.
  (await cookies()).set(META_STATE_COOKIE, `${state}.${user.id}.${biz.businessId}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/meta",
    maxAge: 600,
  });
  return NextResponse.redirect(dialogUrl(cfg, await metaRedirectUri(), state));
}
