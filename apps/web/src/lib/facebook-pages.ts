import "server-only";
import { decryptSecret } from "./crypto";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type ConnectedPage = { id: string; page_id: string; name: string; tasks: string[]; connected_at: string; messenger_enabled: boolean };

/** The business's connected Pages, as members may see them (no tokens). */
export async function businessPages(businessId: string): Promise<ConnectedPage[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_facebook_pages", { p_business_id: businessId });
  return (data as ConnectedPage[] | null) ?? [];
}

/** One connected Page with its decrypted token. Server only; scoped to the business. */
export async function pageWithToken(businessId: string, rowId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(rowId)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("facebook_pages")
    .select("page_id, name, tasks, page_token_enc")
    .eq("business_id", businessId)
    .eq("id", rowId)
    .maybeSingle();
  if (!data) return null;
  return {
    pageId: data.page_id as string,
    name: data.name as string,
    tasks: (data.tasks as string[]) ?? [],
    token: decryptSecret(data.page_token_enc as string),
  };
}

export const RECONNECT_MESSAGE = "Facebook access for this Page has expired or was removed. Reconnect it in Integrations.";
