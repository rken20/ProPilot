import Link from "next/link";
import { can } from "@propilot/shared";
import { PageHeader, buttonClass } from "@/components/ui";
import { Icon3d } from "@/components/icon-3d";
import { requireBusiness } from "@/lib/auth";
import { manilaMonthStart } from "@/lib/matching";
import { formatPeso } from "@/lib/money";
import { businessPlan } from "@/lib/plan";
import { PRICING_TYPES, PRICING_TYPE_LABEL, type PricingReport } from "@/lib/pricing-advisor";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import { PricingAdvisor } from "./pricing-view";

// A price check searches the web and can take most of a minute.
export const maxDuration = 60;

export default async function PricingPage({ searchParams }: PageProps<"/app/pricing">) {
  const sp = await searchParams;
  const biz = await requireBusiness();
  const plan = await businessPlan(biz.businessId);
  const supabase = await createClient();
  const propertyId = typeof sp.property === "string" && /^[0-9a-f-]{36}$/i.test(sp.property) ? sp.property : null;

  const header = (
    <PageHeader
      title="Pricing Advisor"
      description="Tell it about a property and the AI researches similar listings nearby, then suggests a price range and three asking prices. You decide the final price."
    />
  );

  if (plan.priceChecks === 0) {
    return (
      <>
        {header}
        <section className="flex flex-wrap items-center gap-5 rounded-[1.5rem] bg-tile-lavender p-6 sm:p-8">
          <Icon3d name="money" size={72} />
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-xl font-extrabold tracking-tight">Part of the Agency plan</h2>
            <p className="mt-1 max-w-xl text-sm text-ink/80">
              Agency includes {20} price checks a month. Each one finds comparable listings in the same area, works out the price per square meter, and
              gives you a Sell fast, Market and Premium price with a link to every listing it used.
            </p>
          </div>
          {can(biz.role, "billing.view") ? (
            <Link href="/app/billing" className={buttonClass("primary")}>
              See the Agency plan
            </Link>
          ) : null}
        </section>
      </>
    );
  }

  const [{ data: property }, { count: used }, { data: recent }] = await Promise.all([
    propertyId
      ? supabase.from("properties").select("id, name, type, location, price_minor").eq("id", propertyId).eq("business_id", biz.businessId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("price_checks").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).gte("created_at", manilaMonthStart()),
    supabase.from("price_checks").select("id, input, result, created_at").eq("business_id", biz.businessId).not("result", "is", null).order("created_at", { ascending: false }).limit(5),
  ]);
  const prefillType = property && (PRICING_TYPES as readonly string[]).includes(property.type as string) ? (property.type as string) : "";

  return (
    <>
      {header}
      <PricingAdvisor
        canRun={can(biz.role, "property.update")}
        used={used ?? 0}
        limit={plan.priceChecks}
        property={property ? { id: property.id as string, name: property.name as string, priceMinor: Number(property.price_minor) } : null}
        initial={{ location: (property?.location as string | undefined) ?? "", type: prefillType }}
      />

      {recent?.length ? (
        <section className="mt-10" aria-labelledby="recent-title">
          <h2 id="recent-title" className="text-lg font-extrabold tracking-tight">
            Recent price checks
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-[1.5rem] border border-line bg-white px-5 shadow-[var(--shadow-card)]">
            {recent.map((c) => {
              const input = (c.input ?? {}) as { location?: string; type?: string };
              const report = c.result as PricingReport;
              return (
                <li key={c.id as string} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">{PRICING_TYPE_LABEL[input.type as keyof typeof PRICING_TYPE_LABEL] ?? "Property"}</span>
                    <span className="text-muted"> in {input.location}</span>
                  </span>
                  <span className="text-muted tabular-nums">
                    Market price <span className="font-bold text-ink">{formatPeso(report.options?.market)}</span> · {timeAgo(c.created_at as string)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
