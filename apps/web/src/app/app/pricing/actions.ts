"use server";

import { appSay } from "@/lib/lang-server";
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { fieldErrorsFrom } from "@/lib/form";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { businessPlan } from "@/lib/plan";
import { pricingInputSchema, researchPrice, type OwnListing, type PricingInput, type PricingReport } from "@/lib/pricing-advisor";
import { publicListingPath } from "@/lib/public-listing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const FIELDS = ["location", "type", "floorArea", "lotArea", "bedrooms", "bathrooms", "condition"] as const;

export type PriceState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** What the person typed, so the form keeps it. */
  values?: Record<string, string>;
  report?: PricingReport;
  input?: PricingInput;
};

/** Public MyHomeSeller listings of the same type in the same town, as extra context. */
async function ownListings(admin: NonNullable<ReturnType<typeof createAdminClient>>, input: PricingInput, exceptId: string | null): Promise<OwnListing[]> {
  // The town is usually the last part or two of the address ("…, Mandurriao, Iloilo City").
  const places = input.location
    .split(",")
    .map((p) => p.replace(/[%_(),"\\*]/g, " ").trim())
    .filter((p) => p.length >= 3)
    .slice(-2);
  if (!places.length) return [];
  let query = admin
    .from("properties")
    .select("id, name, location, price_minor, businesses!inner(restricted_at)")
    .eq("is_public", true)
    .is("businesses.restricted_at", null)
    .eq("status", "available")
    .eq("type", input.type)
    .or(places.map((p) => `location.ilike.%${p}%`).join(","))
    .order("updated_at", { ascending: false })
    .limit(6);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query;
  return (data ?? []).map((l) => ({ id: l.id as string, name: l.name as string, location: l.location as string, priceMinor: Number(l.price_minor) }));
}

/** One price check: takes one from the month's allowance, researches comparables, and gives the allowance back if nothing came of it. */
export async function checkPrice(propertyId: string | null, _prev: PriceState, form: FormData): Promise<PriceState> {
  const say = await appSay();
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? "")]));
  if (!can(biz.role, "property.update")) return { values, error: say("Your role can't run price checks.", "Hindi pwedeng mag-run ng price checks ang role mo.") };
  const plan = await businessPlan(biz.businessId);
  if (plan.priceChecks === 0) return { values, error: say("The Pricing Advisor is part of the Agency plan. An owner can upgrade in Billing.", "Kasama ang Pricing Advisor sa Agency plan. Pwedeng mag-upgrade ang owner sa Billing.") };

  const parsed = pricingInputSchema.safeParse(values);
  if (!parsed.success) return { values, fieldErrors: fieldErrorsFrom(parsed.error, say) };
  const input = parsed.data;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const admin = createAdminClient();
  if (!apiKey || !admin) return { values, error: say("The Pricing Advisor isn't available right now.", "Hindi available ang Pricing Advisor ngayon.") };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "price_check", p_limit: 6, p_window_seconds: 3600 });
  if (allowed !== true) return { values, error: say("You've run several price checks this hour. Try again later.", "Ilang beses ka nang nag-price check ngayong oras. Subukan ulit mamaya.") };

  const property = propertyId && UUID.test(propertyId) ? propertyId : null;
  const { data: checkId } = await admin.rpc("price_check_start", {
    p_business: biz.businessId,
    p_user: user.id,
    p_limit: plan.priceChecks,
    p_property: property,
    p_input: input,
  });
  if (!checkId) return { values, error: say(`You've used this month's ${plan.priceChecks} price checks. They renew on the 1st.`, `Nagamit mo na ang ${plan.priceChecks} price checks ngayong buwan. Magre-renew sa a-uno.`) };

  let report: PricingReport | null = null;
  try {
    const own = await ownListings(admin, input, property);
    report = await researchPrice(new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0 }), process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, input, own, publicListingPath);
  } catch (e) {
    console.error("price check failed", e instanceof Error ? e.message : e);
  }
  if (!report) {
    // Nothing useful came back, so it doesn't count against the month.
    await admin.from("price_checks").delete().eq("id", checkId).eq("business_id", biz.businessId);
    return { values, error: say("Couldn't find enough similar listings for that, even in nearby towns. Add the town and province to the address and check the area, then try again. This check wasn't counted.", "Kulang ang nahanap na katulad na listing, kahit sa mga kalapit na bayan. Idagdag ang town at province sa address at i-check ang area, tapos subukan ulit. Hindi binilang ang check na ito.") };
  }
  await admin.from("price_checks").update({ result: report }).eq("id", checkId).eq("business_id", biz.businessId);
  revalidatePath("/app/pricing");
  return { values, report, input };
}

/** The owner picks a price for a listing. Any price is theirs to set; the options are only suggestions. */
export async function setAskingPrice(propertyId: string, priceMinor: number): Promise<void> {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.update") || !UUID.test(propertyId)) return;
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 10_000_000 || priceMinor > 500_000_000_000) return;
  const supabase = await createClient();
  await supabase.from("properties").update({ price_minor: priceMinor }).eq("id", propertyId).eq("business_id", biz.businessId);
  revalidatePath(`/app/properties/${propertyId}`);
  revalidatePath(publicListingPath(propertyId));
  redirect(`/app/properties/${propertyId}?notice=price-updated`);
}
