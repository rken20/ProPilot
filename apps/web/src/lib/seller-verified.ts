import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Whether MyHomeSeller has verified a business. Read on the server: the table is the app admin's. */
export async function sellerVerified(businessId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin
    .from("seller_verifications")
    .select("business_id")
    .eq("business_id", businessId)
    .maybeSingle();
  return Boolean(data);
}

/** Where a seller writes to ask to be verified, when the app has an address for that. */
export function supportEmail(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const v = (env.SUPPORT_EMAIL ?? env.PRIVACY_CONTACT_EMAIL ?? "").trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v) && v.length <= 254
    ? v
    : null;
}
