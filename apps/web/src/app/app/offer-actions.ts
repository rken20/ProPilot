"use server";

import { appSay } from "@/lib/lang-server";
import { revalidatePath } from "next/cache";
import { requireBusiness, requireUser } from "@/lib/auth";
import { str } from "@/lib/form";
import { checkFloor } from "@/lib/floor-rules";
import { decisionMessage } from "@/lib/negotiation";
import { businessPlan } from "@/lib/plan";
import { sendAsTeam, type TeamConversation } from "@/lib/team-send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const isManager = (role: string) => role === "owner" || role === "admin";

export type FloorState = { error?: string; saved?: number };

/** Save or change the lowest price the owner would accept for a listing. Owners and admins only (the database enforces it too). */
export async function saveLowestPrice(propertyId: string, _prev: FloorState, form: FormData): Promise<FloorState> {
  const say = await appSay();
  const biz = await requireBusiness();
  if (!isManager(biz.role) || !UUID.test(propertyId)) return { error: say("Only the owner or an admin can set this.", "Owner o admin lang ang pwedeng mag-set nito.") };
  const plan = await businessPlan(biz.businessId);
  if (!plan.negotiation) return { error: say("AI negotiation is part of the Pro and Agency plans.", "Kasama ang AI negotiation sa Pro at Agency plans.") };

  const supabase = await createClient();
  const { data: listing } = await supabase.from("properties").select("id, price_minor").eq("id", propertyId).eq("business_id", biz.businessId).maybeSingle();
  if (!listing) return { error: "Listing not found." };

  // Required on plans with AI negotiation, so it can be changed but not cleared.
  const check = checkFloor(str(form, "lowestPrice"), str(form, "acceptPrice"), Number(listing.price_minor), true);
  if (!check.ok) return { error: say(...check.message) };
  const { minMinor, acceptMinor } = check.floor!;
  const { error } = await supabase
    .from("listing_floors")
    .upsert({ property_id: propertyId, business_id: biz.businessId, min_price_minor: minMinor, accept_price_minor: acceptMinor }, { onConflict: "property_id" });
  if (error) return { error: say("Couldn't save it. Please try again.", "Hindi na-save. Paki-try ulit.") };
  revalidatePath(`/app/properties/${propertyId}`);
  return { saved: Date.now() };
}

export type DecideState = { error?: string; notice?: string };

/**
 * The owner's answer to an offer the AI collected. The decision is recorded first;
 * then the buyer is told in the chat, with the text the owner saw beside the buttons.
 */
export async function answerOffer(offerId: string, confirm: boolean): Promise<DecideState> {
  const say = await appSay();
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!UUID.test(offerId)) return { error: say("Offer not found.", "Hindi makita ang offer.") };
  const supabase = await createClient();
  const { data: outcome } = await supabase.rpc("decide_offer", { p_offer: offerId, p_confirm: confirm });
  if (outcome === "not_pending") return { error: say("This offer was already answered.", "Nasagot na ang offer na ito.") };
  if (outcome === "deal_taken") return { error: say("This listing already has an agreed deal with another buyer, so this offer can't be confirmed. You can decline it.", "May napagkasunduan nang deal ang listing na ito sa ibang buyer, kaya hindi na ma-confirm ang offer na ito. Pwede mo itong i-decline.") };
  if (outcome !== "confirmed" && outcome !== "declined") return { error: say("Only the owner or an admin can answer an offer.", "Owner o admin lang ang pwedeng sumagot sa offer.") };

  revalidatePath("/app/inbox");
  const done = confirm ? say("Offer confirmed.", "Na-confirm na ang offer.") : say("Offer declined.", "Na-decline na ang offer.");
  const admin = createAdminClient();
  const { data: offer } = await supabase
    .from("listing_offers")
    .select("amount_minor, property_id, conversation_id, properties(name)")
    .eq("id", offerId)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  if (offer?.property_id) revalidatePath(`/app/properties/${offer.property_id}`);
  if (!admin || !offer?.conversation_id) return { notice: say(`${done} Message the buyer to let them know.`, `${done} I-message ang buyer para malaman nila.`) };

  const [{ data: conv }, { data: settings }] = await Promise.all([
    admin
      .from("messenger_conversations")
      .select("id, channel, page_row_id, psid, last_inbound_at")
      .eq("id", offer.conversation_id)
      .eq("business_id", biz.businessId)
      .maybeSingle(),
    admin.from("agent_settings").select("chat_language").eq("business_id", biz.businessId).maybeSingle(),
  ]);
  if (!conv) return { notice: say(`${done} Message the buyer to let them know.`, `${done} I-message ang buyer para malaman nila.`) };
  const listingName = (offer.properties as unknown as { name: string } | null)?.name ?? "the listing";
  const text = decisionMessage(confirm, Number(offer.amount_minor), listingName, settings?.chat_language === "english" ? "english" : "taglish");
  const sent = await sendAsTeam(admin, biz.businessId, conv as TeamConversation, text, user.id);
  if (sent.error) return { notice: say(`${done} The buyer wasn't told in the chat: ${sent.error}`, `${done} Hindi nasabihan ang buyer sa chat: ${sent.error}`) };
  return { notice: say(`${done} The buyer was told in the chat, and the conversation is now yours.`, `${done} Nasabihan na ang buyer sa chat, at sa'yo na ang conversation.`) };
}
