"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, requireUser } from "@/lib/auth";
import { str } from "@/lib/form";
import { formatPeso, pesosToCentavos } from "@/lib/money";
import { decisionMessage } from "@/lib/negotiation";
import { businessPlan } from "@/lib/plan";
import { sendAsTeam, type TeamConversation } from "@/lib/team-send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const isManager = (role: string) => role === "owner" || role === "admin";

export type FloorState = { error?: string; saved?: number };

/** Save, change or clear the lowest price the owner would accept for a listing. Owners and admins only (the database enforces it too). */
export async function saveLowestPrice(propertyId: string, _prev: FloorState, form: FormData): Promise<FloorState> {
  const biz = await requireBusiness();
  if (!isManager(biz.role) || !UUID.test(propertyId)) return { error: "Only the owner or an admin can set this." };
  const plan = await businessPlan(biz.businessId);
  if (!plan.negotiation) return { error: "AI negotiation is part of the Pro and Agency plans." };

  const supabase = await createClient();
  const { data: listing } = await supabase.from("properties").select("id, price_minor").eq("id", propertyId).eq("business_id", biz.businessId).maybeSingle();
  if (!listing) return { error: "Listing not found." };

  const minor = pesosToCentavos(str(form, "lowestPrice"));
  const accept = pesosToCentavos(str(form, "acceptPrice"));
  const asking = Number(listing.price_minor);
  if (accept !== null) {
    if (Number.isNaN(accept) || accept <= 0) return { error: "Enter the accept-right-away price in pesos, like 4800000." };
    if (minor === null) return { error: "Set your lowest price first. The accept-right-away price has to be at or above it." };
    if (!Number.isNaN(minor) && accept < minor) return { error: "The accept-right-away price can't be under your lowest price." };
    if (accept > asking) return { error: `The accept-right-away price can't be above the asking price (${formatPeso(asking)}).` };
  }
  if (minor === null) {
    const { error } = await supabase.from("listing_floors").delete().eq("property_id", propertyId);
    if (error) return { error: "Couldn't clear it. Please try again." };
  } else {
    if (Number.isNaN(minor) || minor <= 0) return { error: "Enter an amount in pesos, like 4500000." };
    if (minor > Number(listing.price_minor)) return { error: `It can't be above the asking price (${formatPeso(Number(listing.price_minor))}).` };
    const { error } = await supabase
      .from("listing_floors")
      .upsert({ property_id: propertyId, business_id: biz.businessId, min_price_minor: minor, accept_price_minor: accept }, { onConflict: "property_id" });
    if (error) return { error: "Couldn't save it. Please try again." };
  }
  revalidatePath(`/app/properties/${propertyId}`);
  return { saved: Date.now() };
}

export type DecideState = { error?: string; notice?: string };

/**
 * The owner's answer to an offer the AI collected. The decision is recorded first;
 * then the buyer is told in the chat, with the text the owner saw beside the buttons.
 */
export async function answerOffer(offerId: string, confirm: boolean): Promise<DecideState> {
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!UUID.test(offerId)) return { error: "Offer not found." };
  const supabase = await createClient();
  const { data: outcome } = await supabase.rpc("decide_offer", { p_offer: offerId, p_confirm: confirm });
  if (outcome === "not_pending") return { error: "This offer was already answered." };
  if (outcome === "deal_taken") return { error: "This listing already has an agreed deal with another buyer, so this offer can't be confirmed. You can decline it." };
  if (outcome !== "confirmed" && outcome !== "declined") return { error: "Only the owner or an admin can answer an offer." };

  revalidatePath("/app/inbox");
  const done = confirm ? "Offer confirmed." : "Offer declined.";
  const admin = createAdminClient();
  const { data: offer } = await supabase
    .from("listing_offers")
    .select("amount_minor, property_id, conversation_id, properties(name)")
    .eq("id", offerId)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  if (offer?.property_id) revalidatePath(`/app/properties/${offer.property_id}`);
  if (!admin || !offer?.conversation_id) return { notice: `${done} Message the buyer to let them know.` };

  const [{ data: conv }, { data: settings }] = await Promise.all([
    admin
      .from("messenger_conversations")
      .select("id, channel, page_row_id, psid, last_inbound_at")
      .eq("id", offer.conversation_id)
      .eq("business_id", biz.businessId)
      .maybeSingle(),
    admin.from("agent_settings").select("chat_language").eq("business_id", biz.businessId).maybeSingle(),
  ]);
  if (!conv) return { notice: `${done} Message the buyer to let them know.` };
  const listingName = (offer.properties as unknown as { name: string } | null)?.name ?? "the listing";
  const text = decisionMessage(confirm, Number(offer.amount_minor), listingName, settings?.chat_language === "english" ? "english" : "taglish");
  const sent = await sendAsTeam(admin, biz.businessId, conv as TeamConversation, text, user.id);
  if (sent.error) return { notice: `${done} The buyer wasn't told in the chat: ${sent.error}` };
  return { notice: `${done} The buyer was told in the chat, and the conversation is now yours.` };
}
