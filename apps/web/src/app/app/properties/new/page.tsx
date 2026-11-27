import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { PageHeader } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { businessPages } from "@/lib/facebook-pages";
import { metaConfig } from "@/lib/meta";
import { NewProperty } from "./new-property";
import { aiEnabled, businessPlan } from "@/lib/plan";
import { manilaMonthStart } from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";
import type { PriceHelperPlan } from "./price-helper";

// The Pricing Advisor on this page searches the web and can take most of a minute.
export const maxDuration = 60;

export default async function NewPropertyPage() {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) redirect("/app/properties");
  const plan = await businessPlan(biz.businessId);
  let pricing: PriceHelperPlan | null = null;
  if (plan.priceChecks === 0) pricing = { kind: "upgrade", canSeeBilling: can(biz.role, "billing.view") };
  else if (can(biz.role, "property.update")) {
    const supabase = await createClient();
    const { count } = await supabase.from("price_checks").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).gte("created_at", manilaMonthStart());
    pricing = { kind: "ready", limit: plan.priceChecks, left: plan.priceChecks === null ? null : Math.max(0, plan.priceChecks - (count ?? 0)) };
  }
  // Start from how this business last declared, so a broker doesn't retype the licence for every listing. The box is still ticked each time.
  const { data: last } = await (await createClient())
    .from("properties")
    .select("seller_capacity, seller_license")
    .eq("business_id", biz.businessId)
    .not("seller_capacity", "is", null)
    .order("declared_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (
    <>
      <Link href="/app/properties" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Properties
      </Link>
      <PageHeader icon3d="house" tone="mint" title="Add property" />
      <NewProperty
        canPaste={await aiEnabled(biz.businessId)}
        pages={metaConfig() ? (await businessPages(biz.businessId)).map((p) => ({ id: p.id, name: p.name })) : []}
        pricing={pricing}
        negotiation={plan.negotiation ? (biz.role === "owner" || biz.role === "admin" ? "set" : "later") : undefined}
        seller={{ sellerCapacity: (last?.seller_capacity as string | null) ?? "", sellerLicense: (last?.seller_license as string | null) ?? "" }}
      />
    </>
  );
}
