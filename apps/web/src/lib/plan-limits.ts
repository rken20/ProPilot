import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { manilaMonthStart } from "@/lib/matching";

/** People in a business for the plan's team limit: active members plus invitations still open. */
export async function teamSeatsUsed(db: SupabaseClient, businessId: string): Promise<number> {
  const [members, invites] = await Promise.all([
    db.from("business_members").select("user_id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active"),
    db
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  return (members.count ?? 0) + (invites.count ?? 0);
}

/** AI chat and Messenger replies sent this month (Manila calendar month). */
export async function aiRepliesThisMonth(db: SupabaseClient, businessId: string): Promise<number> {
  const { count } = await db
    .from("messenger_messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("sender", "ai")
    .gte("created_at", manilaMonthStart());
  return count ?? 0;
}
