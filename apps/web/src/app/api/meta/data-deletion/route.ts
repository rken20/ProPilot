import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { metaConfig, parseSignedRequest } from "@/lib/meta";
import { metaOrigin } from "@/lib/meta-oauth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Meta's data deletion callback. When someone removes ProPilot from their
 * Facebook account and asks for their data to be deleted, Meta posts a signed
 * request here. We delete every Page token that person connected and return a
 * link where they can check the status.
 */
export async function POST(request: NextRequest) {
  const cfg = metaConfig();
  const admin = createAdminClient();
  if (!cfg || !admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const data = typeof signed === "string" ? parseSignedRequest(signed, cfg.appSecret) : null;
  if (!data) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });

  const { data: deleted } = await admin.from("facebook_pages").delete().eq("fb_user_id", data.user_id).select("id");
  const code = randomBytes(9).toString("base64url");
  await admin.from("meta_deletion_requests").insert({
    confirmation_code: code,
    fb_user_id: data.user_id,
    pages_deleted: deleted?.length ?? 0,
  });
  return NextResponse.json({ url: `${await metaOrigin()}/privacy/deletion?code=${code}`, confirmation_code: code });
}
