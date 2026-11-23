"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, requireUser } from "@/lib/auth";
import { FACT_COLUMNS, factsOf, type ListingForMatch } from "@/lib/buyer-finder";
import { scoreMatch } from "@/lib/matching";
import { businessPlan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AddState = { error?: string; added?: boolean };

const WHY: Record<string, string> = {
  not_available: "This listing isn't available anymore.",
  denied: "Only owners, admins and agents can use Buyer Finder.",
  not_open: "This lead is closed. Reopen it on the Leads page first.",
  already: "This lead is already a potential buyer for this listing.",
  limit: "You've used this month's Buyer Finder allowance. It resets on the 1st, or upgrade in Billing.",
};

const UUID = /^[0-9a-f-]{36}$/i;

/** Add a lead as a potential buyer for a listing (counts toward the plan's monthly allowance). */
export async function addPotentialBuyer(propertyId: string, prospectId: string): Promise<AddState> {
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!UUID.test(propertyId) || !UUID.test(prospectId)) return { error: "Something went wrong. Refresh and try again." };

  const plan = await businessPlan(biz.businessId);
  if (!plan.ai || plan.homeFinderBuyers === 0) return { error: "Buyer Finder is part of the paid plans. An owner can upgrade in Billing." };

  // The person's own client: they must be able to see both the listing and the lead.
  const supabase = await createClient();
  const [{ data: p }, { data: lead }] = await Promise.all([
    supabase.from("properties").select("id, business_id, type, location, price_minor, financing, status").eq("id", propertyId).eq("business_id", biz.businessId).maybeSingle(),
    supabase.from("prospects").select(`id, ${FACT_COLUMNS}`).eq("id", prospectId).eq("business_id", biz.businessId).maybeSingle(),
  ]);
  if (!p || !lead) return { error: "This listing or lead isn't available." };
  const match = scoreMatch({ ...p, price_minor: Number(p.price_minor) } as ListingForMatch, factsOf(lead));
  if (!match) return { error: "This lead doesn't fit the listing anymore." };

  const admin = createAdminClient();
  if (!admin) return { error: "Buyer Finder isn't available right now." };
  const { data: result, error } = await admin.rpc("buyer_finder_add", {
    p_property: propertyId,
    p_prospect: prospectId,
    p_user: user.id,
    p_limit: plan.homeFinderBuyers,
    p_score: match.score,
  });
  if (error) {
    console.error("[buyer-finder] add failed:", error.message);
    return { error: "Couldn't add them. Please try again." };
  }
  if (result !== "added") return { error: WHY[result as string] ?? "Couldn't add them. Please try again." };
  revalidatePath(`/app/properties/${propertyId}`);
  revalidatePath(`/app/pipeline/${prospectId}`);
  revalidatePath("/app");
  return { added: true };
}
