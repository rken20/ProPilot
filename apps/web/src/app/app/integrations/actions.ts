"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { SHEETS_SCOPE, createSpreadsheet, googleConfig, refreshAccessToken, revokeToken } from "@/lib/google";
import { syncLeadsSheet } from "@/lib/lead-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

const done = (notice: string) => {
  revalidatePath("/app/integrations");
  revalidatePath("/app/leads");
  redirect(`/app/integrations?notice=${notice}`);
};

/** Create "ProPilot leads – <business>" in the signed-in user's Drive and keep it in sync. */
export async function createLeadsSheet() {
  const user = await requireUser();
  const biz = await requireBusiness();
  if (!can(biz.role, "business.update")) done("not-allowed");
  const cfg = googleConfig();
  const admin = createAdminClient();
  if (!cfg || !admin) done("google-not-ready");

  const { data: conn } = await admin!.from("google_connections").select("refresh_token_enc, scopes").eq("user_id", user.id).maybeSingle();
  if (!conn || !(conn.scopes as string[]).includes(SHEETS_SCOPE)) done("connect-first");

  let failed = false;
  try {
    const { access_token } = await refreshAccessToken(fetch, cfg!, decryptSecret(conn!.refresh_token_enc as string));
    const sheet = await createSpreadsheet(fetch, access_token, `ProPilot leads – ${biz.businessName}`);
    await admin!.from("business_integrations").upsert({
      business_id: biz.businessId,
      sheets_user_id: user.id,
      spreadsheet_id: sheet.spreadsheetId,
      spreadsheet_url: sheet.spreadsheetUrl,
      updated_at: new Date().toISOString(),
    });
    await syncLeadsSheet(biz.businessId);
  } catch (e) {
    console.error("[google] create sheet failed:", e instanceof Error ? e.message : String(e));
    failed = true;
  }
  done(failed ? "sheet-failed" : "sheet-created");
}

export async function syncSheetNow() {
  const biz = await requireBusiness();
  if (!can(biz.role, "business.update")) done("not-allowed");
  await syncLeadsSheet(biz.businessId);
  done("sheet-synced");
}

/** Stop syncing. The spreadsheet stays in the owner's Drive. */
export async function stopSheetSync() {
  const biz = await requireBusiness();
  if (!can(biz.role, "business.update")) done("not-allowed");
  const admin = createAdminClient();
  await admin?.from("business_integrations").update({ sheets_user_id: null, updated_at: new Date().toISOString() }).eq("business_id", biz.businessId);
  done("sheet-stopped");
}

/** Revoke ProPilot's access with Google and forget the token. */
export async function disconnectGoogle() {
  const user = await requireUser();
  const admin = createAdminClient();
  if (!admin) done("google-not-ready");
  const { data: conn } = await admin!.from("google_connections").select("refresh_token_enc").eq("user_id", user.id).maybeSingle();
  if (conn) {
    try {
      await revokeToken(fetch, decryptSecret(conn.refresh_token_enc as string));
    } catch {
      /* already revoked or key changed: still forget it */
    }
    await admin!.from("google_connections").delete().eq("user_id", user.id);
    await admin!.from("business_integrations").update({ sheets_user_id: null }).eq("sheets_user_id", user.id);
  }
  done("google-disconnected");
}

/** Remove a connected Facebook Page and its stored token. */
export async function disconnectFacebookPage(rowId: string) {
  const biz = await requireBusiness();
  if (!can(biz.role, "facebook.connect")) done("not-allowed");
  const admin = createAdminClient();
  if (admin && /^[0-9a-f-]{36}$/i.test(rowId)) {
    await admin.from("facebook_pages").delete().eq("business_id", biz.businessId).eq("id", rowId);
  }
  done("facebook-disconnected");
}
