"use server";

import type { Say } from "@/lib/lang";
import { appSay } from "@/lib/lang-server";
import { revalidatePath } from "next/cache";
import { requireBusiness, requireUser } from "@/lib/auth";
import { FACT_COLUMNS, factsOf, type ListingForMatch } from "@/lib/buyer-finder";
import { scoreMatch } from "@/lib/matching";
import { businessPlan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AddState = { error?: string; added?: boolean };

const why = (say: Say): Record<string, string> => ({
  not_available: say("This listing isn't available anymore.", "Hindi na available ang listing na ito."),
  denied: say("Only owners, admins and agents can use Buyer Finder.", "Owners, admins at agents lang ang pwedeng gumamit ng Buyer Finder."),
  not_open: say("This lead is closed. Reopen it on the Leads page first.", "Closed na ang lead na ito. I-reopen muna ito sa Leads page."),
  already: say("This lead is already a potential buyer for this listing.", "Potential buyer na ng listing na ito ang lead na ito."),
  limit: say("You've used this month's Buyer Finder allowance. It resets on the 1st, or upgrade in Billing.", "Nagamit mo na ang Buyer Finder allowance ngayong buwan. Magre-reset ito sa a-uno, o mag-upgrade sa Billing."),
});

const UUID = /^[0-9a-f-]{36}$/i;

/** Add a lead as a potential buyer for a listing (counts toward the plan's monthly allowance). */
export async function addPotentialBuyer(propertyId: string, prospectId: string): Promise<AddState> {
  const say = await appSay();
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!UUID.test(propertyId) || !UUID.test(prospectId)) return { error: say("Something went wrong. Refresh and try again.", "May nagkaproblema. I-refresh at subukan ulit.") };

  const plan = await businessPlan(biz.businessId);
  if (!plan.ai || plan.homeFinderBuyers === 0) return { error: say("Buyer Finder is part of the paid plans. An owner can upgrade in Billing.", "Kasama ang Buyer Finder sa paid plans. Pwedeng mag-upgrade ang owner sa Billing.") };

  // The person's own client: they must be able to see both the listing and the lead.
  const supabase = await createClient();
  const [{ data: p }, { data: lead }] = await Promise.all([
    supabase.from("properties").select("id, business_id, type, location, price_minor, financing, status").eq("id", propertyId).eq("business_id", biz.businessId).maybeSingle(),
    supabase.from("prospects").select(`id, ${FACT_COLUMNS}`).eq("id", prospectId).eq("business_id", biz.businessId).maybeSingle(),
  ]);
  if (!p || !lead) return { error: say("This listing or lead isn't available.", "Hindi available ang listing o lead na ito.") };
  const match = scoreMatch({ ...p, price_minor: Number(p.price_minor) } as ListingForMatch, factsOf(lead));
  if (!match) return { error: say("This lead doesn't fit the listing anymore.", "Hindi na bagay sa listing ang lead na ito.") };

  const admin = createAdminClient();
  if (!admin) return { error: say("Buyer Finder isn't available right now.", "Hindi available ang Buyer Finder ngayon.") };
  const { data: result, error } = await admin.rpc("buyer_finder_add", {
    p_property: propertyId,
    p_prospect: prospectId,
    p_user: user.id,
    p_limit: plan.homeFinderBuyers,
    p_score: match.score,
  });
  if (error) {
    console.error("[buyer-finder] add failed:", error.message);
    return { error: say("Couldn't add them. Please try again.", "Hindi sila na-add. Paki-try ulit.") };
  }
  if (result !== "added") return { error: why(say)[result as string] ?? say("Couldn't add them. Please try again.", "Hindi sila na-add. Paki-try ulit.") };
  revalidatePath(`/app/properties/${propertyId}`);
  revalidatePath(`/app/pipeline/${prospectId}`);
  revalidatePath("/app");
  return { added: true };
}
