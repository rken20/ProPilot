import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { settledStatus, type BoostStatus } from "./boost-rules";
import { decryptSecret, encryptSecret } from "./crypto";
import { metaConfig, type MetaConfig } from "./meta";
import { AD_PERMISSIONS, campaignResults, grantedPermissions, needsReconnect } from "./meta-ads";

/** A long-lived Facebook user token lasts about 60 days; count 59 to be safe. */
const TOKEN_DAYS = 59;

export type AdSignIn = { token: string; fbUserId: string; expired: boolean; expiresAt: string; adAccountId: string | null; adAccountName: string | null };

/** The business's Facebook sign-in that may run ads, decrypted. Server only. */
export async function adSignIn(admin: SupabaseClient, businessId: string): Promise<AdSignIn | null> {
  const { data } = await admin
    .from("meta_ad_connections")
    .select("fb_user_id, user_token_enc, token_expires_at, ad_account_id, ad_account_name")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return null;
  return {
    token: decryptSecret(data.user_token_enc as string),
    fbUserId: data.fb_user_id as string,
    expiresAt: data.token_expires_at as string,
    expired: new Date(data.token_expires_at as string) <= new Date(),
    adAccountId: (data.ad_account_id as string | null) ?? null,
    adAccountName: (data.ad_account_name as string | null) ?? null,
  };
}

/**
 * After Facebook is connected: keep the sign-in for boosting only when the person granted every ad
 * permission; otherwise drop any kept before by the same person. A different person's sign-in
 * clears the chosen ad account, which may not be theirs.
 */
export async function saveAdSignIn(admin: SupabaseClient, cfg: MetaConfig, businessId: string, userId: string, fbUserId: string, userToken: string): Promise<boolean> {
  let granted: string[] = [];
  try {
    granted = await grantedPermissions(fetch, cfg, userToken);
  } catch {
    return false;
  }
  if (!AD_PERMISSIONS.every((p) => granted.includes(p))) {
    await admin.from("meta_ad_connections").delete().eq("business_id", businessId).eq("fb_user_id", fbUserId);
    return false;
  }
  const { data: before } = await admin.from("meta_ad_connections").select("fb_user_id").eq("business_id", businessId).maybeSingle();
  const samePerson = before?.fb_user_id === fbUserId;
  await admin.from("meta_ad_connections").upsert(
    {
      business_id: businessId,
      fb_user_id: fbUserId,
      user_token_enc: encryptSecret(userToken),
      token_expires_at: new Date(Date.now() + TOKEN_DAYS * 86_400_000).toISOString(),
      connected_by: userId,
      updated_at: new Date().toISOString(),
      ...(samePerson ? {} : { ad_account_id: null, ad_account_name: null }),
    },
    { onConflict: "business_id" },
  );
  return true;
}

type BoostRow = { id: string; business_id: string; campaign_id: string | null; status: BoostStatus; ends_at: string | null };

/**
 * Read the latest spend, reach and chats from Meta for running boosts (and ones that ended in the
 * last 2 days, for their final numbers), and mark ended ones finished. Quietly skips what Meta
 * won't answer.
 */
export async function refreshBoosts(admin: SupabaseClient, rows: BoostRow[], cfg: MetaConfig | null = metaConfig()): Promise<number> {
  if (!cfg) return 0;
  const tokens = new Map<string, string | null>();
  let updated = 0;
  for (const b of rows) {
    if (!b.campaign_id) continue;
    if (!tokens.has(b.business_id)) {
      const s = await adSignIn(admin, b.business_id);
      tokens.set(b.business_id, s && !s.expired ? s.token : null);
    }
    const token = tokens.get(b.business_id);
    const status = settledStatus(b.status, b.ends_at);
    if (token) {
      try {
        const r = await campaignResults(fetch, cfg, token, b.campaign_id);
        await admin
          .from("ad_boosts")
          .update({ spend_minor: r.spendMinor, impressions: r.impressions, reach: r.reach, chats: r.chats, results_at: new Date().toISOString(), status })
          .eq("id", b.id);
        updated++;
        continue;
      } catch (e) {
        if (needsReconnect(e)) tokens.set(b.business_id, null);
      }
    }
    if (status !== b.status) await admin.from("ad_boosts").update({ status }).eq("id", b.id);
  }
  return updated;
}

/** The daily job: every boost running, or ended in the last 2 days. */
export async function refreshAllBoosts(admin: SupabaseClient): Promise<number> {
  const { data } = await admin
    .from("ad_boosts")
    .select("id, business_id, campaign_id, status, ends_at")
    .or(`status.eq.active,and(status.in.(finished,stopped),ends_at.gte.${new Date(Date.now() - 2 * 86_400_000).toISOString()})`)
    .limit(200);
  return refreshBoosts(admin, (data ?? []) as BoostRow[]);
}
