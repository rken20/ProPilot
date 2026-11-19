"use server";

import { revalidatePath } from "next/cache";
import { getOrigin, requireBusiness, requireUser } from "@/lib/auth";
import { emailUser } from "@/lib/billing-email";
import { buyerHandle, openBuyersFor, type ListingForMatch } from "@/lib/buyer-finder";
import { formatPeso } from "@/lib/money";
import { businessPlan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SendState = { error?: string; sent?: boolean };

const WHY: Record<string, string> = {
  not_public: "Show this listing to Home Finder buyers first (in the listing details above).",
  denied: "Only owners, admins and agents can send listings to buyers.",
  not_open: "This buyer isn't taking listings from agents anymore.",
  not_basic: "This buyer isn't on Basic anymore, so they can't be matched.",
  already: "You've already sent this listing to this buyer.",
  limit: "You've used this month's Buyer Finder sends. They reset on the 1st.",
};

/**
 * Send a listing to an opted-in Home Finder buyer. The browser only knows the
 * buyer's handle, so the match is worked out again here and the handle looked up.
 */
export async function sendToBuyer(propertyId: string, handle: string): Promise<SendState> {
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || !/^[A-Za-z0-9_-]{22}$/.test(handle)) return { error: "Something went wrong. Refresh and try again." };

  const plan = await businessPlan(biz.businessId);
  if (plan.homeFinderBuyers === 0 || !plan.ai) return { error: "Buyer Finder is part of the Basic plan. An owner can upgrade in Billing." };

  // The user's own client: the listing must be one they can see in this business.
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("properties")
    .select("id, business_id, name, type, location, price_minor, financing, is_public, status")
    .eq("id", propertyId)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  if (!p) return { error: "This listing isn't available." };

  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "buyer_finder_send", p_limit: 30, p_window_seconds: 3600 });
  if (allowed !== true) return { error: "Too many sends. Please wait a while and try again." };

  const listing = { ...p, price_minor: Number(p.price_minor) } as ListingForMatch & { name: string };
  const candidate = (await openBuyersFor(listing, 50)).find((b) => buyerHandle(listing.id, b.buyerId) === handle);
  if (!candidate) return { error: "This buyer doesn't match this listing anymore." };

  const admin = createAdminClient();
  if (!admin) return { error: "Buyer Finder isn't available right now." };
  const { data: result, error } = await admin.rpc("buyer_finder_introduce", {
    p_property: listing.id,
    p_buyer: candidate.buyerId,
    p_user: user.id,
    p_limit: plan.homeFinderBuyers,
    p_score: candidate.match.score,
  });
  if (error) {
    console.error("[buyer-finder] send failed:", error.message);
    return { error: "Couldn't send. Please try again." };
  }
  if (result !== "sent") return { error: WHY[result as string] ?? "Couldn't send. Please try again." };

  // The buyer asked to hear about these when they opted in. Best-effort.
  await emailUser(
    admin,
    candidate.buyerId,
    `${biz.businessName} sent you a listing that fits your search`,
    [
      ["Listing", listing.name],
      ["Where", listing.location],
      ["Price", formatPeso(listing.price_minor)],
      ["Why it fits", candidate.match.fits.join(", ") || "Matches your search"],
    ],
    { label: "See it on Home Finder", url: `${await getOrigin()}/buyer/my-search` },
  );
  revalidatePath(`/app/properties/${listing.id}`);
  return { sent: true };
}
