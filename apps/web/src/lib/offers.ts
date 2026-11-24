import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decisionMessage } from "./negotiation";

export type OfferRow = {
  id: string;
  amountMinor: number;
  counterMinor: number | null;
  outcome: "too_low" | "countered" | "pending" | "confirmed" | "declined" | "accepted";
  buyerName: string | null;
  listingName: string | null;
  conversationId: string | null;
  createdAt: string;
  /** An agreed deal's reference, as the buyer saw it. */
  ref?: string | null;
  messages?: { confirm: string; decline: string };
};

/** The latest offers for one conversation or one listing, as the signed-in teammate may see them (RLS). */
export async function loadOffers(supabase: SupabaseClient, businessId: string, by: { conversationId: string } | { propertyId: string }): Promise<OfferRow[]> {
  let query = supabase
    .from("listing_offers")
    .select("id, amount_minor, counter_minor, outcome, buyer_name, conversation_id, created_at, deal_ref, properties(name)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(6);
  query = "conversationId" in by ? query.eq("conversation_id", by.conversationId) : query.eq("property_id", by.propertyId);
  const [{ data }, { data: settings }] = await Promise.all([query, supabase.from("agent_settings").select("chat_language").eq("business_id", businessId).maybeSingle()]);
  const language = settings?.chat_language === "english" ? "english" : "taglish";
  return (data ?? []).map((o) => {
    const listingName = (o.properties as unknown as { name: string } | null)?.name ?? null;
    const amountMinor = Number(o.amount_minor);
    return {
      id: o.id as string,
      amountMinor,
      counterMinor: o.counter_minor === null ? null : Number(o.counter_minor),
      outcome: o.outcome as OfferRow["outcome"],
      buyerName: (o.buyer_name as string | null) ?? null,
      listingName,
      conversationId: (o.conversation_id as string | null) ?? null,
      createdAt: o.created_at as string,
      ref: (o.deal_ref as string | null) ?? null,
      messages:
        o.outcome === "pending"
          ? { confirm: decisionMessage(true, amountMinor, listingName ?? "the listing", language), decline: decisionMessage(false, amountMinor, listingName ?? "the listing", language) }
          : undefined,
    };
  });
}
