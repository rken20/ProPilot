import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@propilot/shared";
import { getMemberships, requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode, longLivedUserToken, managedPages, meId, metaConfig } from "@/lib/meta";
import { META_STATE_COOKIE, metaRedirectUri } from "@/lib/meta-oauth";
import { createAdminClient } from "@/lib/supabase/admin";

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Facebook sends the person back here. Check the state, then store an
 * encrypted token for each Page they chose. The user token itself is not kept.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const back = new URL("/app/integrations", request.nextUrl.origin);
  const fail = (notice: string) => {
    back.searchParams.set("notice", notice);
    return NextResponse.redirect(back);
  };

  const jar = await cookies();
  const saved = jar.get(META_STATE_COOKIE)?.value ?? "";
  jar.delete({ name: META_STATE_COOKIE, path: "/api/meta" });
  const [state, uid, businessId] = saved.split(".");
  const got = request.nextUrl.searchParams.get("state") ?? "";
  if (!state || !businessId || uid !== user.id || !sameString(state, got)) return fail("facebook-failed");
  if (request.nextUrl.searchParams.get("error")) return fail("facebook-cancelled");

  // Re-check the role now, not just when the flow started.
  const membership = (await getMemberships()).find((m) => m.businessId === businessId);
  if (!membership || !can(membership.role, "facebook.connect")) return fail("not-allowed");

  const code = request.nextUrl.searchParams.get("code");
  const cfg = metaConfig();
  const admin = createAdminClient();
  if (!code || !cfg || !admin) return fail("facebook-failed");

  try {
    const shortToken = await exchangeCode(fetch, cfg, code, await metaRedirectUri());
    const userToken = await longLivedUserToken(fetch, cfg, shortToken);
    const [fbUserId, pages] = await Promise.all([meId(fetch, cfg, userToken), managedPages(fetch, cfg, userToken)]);
    if (!pages.length) return fail("facebook-no-pages");

    const now = new Date().toISOString();
    const { error } = await admin.from("facebook_pages").upsert(
      pages.map((p) => ({
        business_id: businessId,
        page_id: p.id,
        name: p.name.slice(0, 200),
        page_token_enc: encryptSecret(p.access_token),
        tasks: p.tasks ?? [],
        fb_user_id: fbUserId,
        connected_by: user.id,
        connected_at: now,
      })),
      { onConflict: "business_id,page_id" },
    );
    if (error) return fail("facebook-failed");

    // Pages this person connected before but didn't choose this time are dropped.
    await admin
      .from("facebook_pages")
      .delete()
      .eq("business_id", businessId)
      .eq("fb_user_id", fbUserId)
      .not("page_id", "in", `(${pages.map((p) => p.id).join(",")})`);

    back.searchParams.set("notice", "facebook-connected");
    return NextResponse.redirect(back);
  } catch (e) {
    console.error("[meta] callback failed:", e instanceof Error ? e.message : String(e));
    return fail("facebook-failed");
  }
}
