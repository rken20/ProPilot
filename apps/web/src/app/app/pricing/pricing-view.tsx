"use client";

import { useSay } from "@/components/lang";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { Alert, Field, Input, Select, buttonClass, cx } from "@/components/ui";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";
import { SubmitButton } from "@/components/submit-button";
import { formatPeso } from "@/lib/money";
import { CONDITIONS, CONDITION_LABEL, PRICING_DISCLAIMER, PRICING_TYPES, PRICING_TYPE_LABEL, type PricingReport } from "@/lib/pricing-advisor";
import { checkPrice, setAskingPrice, type PriceState } from "./actions";

type Property = { id: string; name: string; priceMinor: number };

const OPTIONS: Array<{ key: keyof PricingReport["options"]; name: string; note: [english: string, taglish: string]; icon: Icon3dName; tile: string }> = [
  { key: "fast", name: "Sell fast", note: ["A competitive price to attract buyers quickly.", "Competitive na presyo para mabilis makaakit ng buyers."], icon: "rocket", tile: "bg-tile-mint" },
  { key: "market", name: "Market price", note: ["Balanced, in line with similar listings.", "Balanse, kapantay ng mga katulad na listing."], icon: "target", tile: "bg-tile-lavender" },
  { key: "premium", name: "Premium price", note: ["A higher asking price. It may take longer to sell.", "Mas mataas na asking price. Baka mas matagal bago mabenta."], icon: "trophy", tile: "bg-tile-peach" },
];

const CONFIDENCE = {
  good: { label: "Good data", tone: "bg-tile-mint text-brand-700" },
  fair: { label: "Some data", tone: "bg-tile-lemon text-brass-700" },
  low: { label: "Little data", tone: "bg-hot-50 text-hot" },
} as const;

export function PricingAdvisor({
  canRun,
  used,
  limit,
  property,
  initial,
}: {
  canRun: boolean;
  used: number;
  limit: number | null;
  property: Property | null;
  initial: { location: string; type: string };
}) {
  const say = useSay();
  const [state, action] = useActionState<PriceState, FormData>(checkPrice.bind(null, property?.id ?? null), {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const left = limit === null ? null : Math.max(0, limit - used);
  // On a phone the report lands below the form, so bring it into view when it arrives.
  const reportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.report) reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.report]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <form action={action} className="h-fit space-y-4 rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
        {property ? (
          <p className="rounded-xl bg-tile-lavender px-3 py-2 text-sm">
            {say("Checking the price of", "Chine-check ang presyo ng")} <span className="font-semibold">{property.name}</span>
            {say(", now listed at", ", na naka-list ngayon sa")} <span className="font-semibold">{formatPeso(property.priceMinor)}</span>.
          </p>
        ) : null}
        <Field label="Address or area" htmlFor="location" error={e.location} hint={say("The barangay or subdivision, the town or city, and the province.", "Barangay o subdivision, town o city, at province.")}>
          <Input id="location" name="location" defaultValue={v.location ?? initial.location} placeholder="Greenwoods, Santa Barbara, Iloilo" required />
        </Field>
        <Field label="Property type" htmlFor="type" error={e.type}>
          <Select id="type" name="type" defaultValue={v.type || initial.type || "house_and_lot"}>
            {PRICING_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRICING_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Floor area (sqm)" htmlFor="floorArea" error={e.floorArea}>
            <Input id="floorArea" name="floorArea" inputMode="decimal" defaultValue={v.floorArea} placeholder="120" />
          </Field>
          <Field label="Lot area (sqm)" htmlFor="lotArea" error={e.lotArea}>
            <Input id="lotArea" name="lotArea" inputMode="decimal" defaultValue={v.lotArea} placeholder="150" />
          </Field>
          <Field label="Bedrooms" htmlFor="bedrooms" error={e.bedrooms}>
            <Input id="bedrooms" name="bedrooms" inputMode="numeric" defaultValue={v.bedrooms} placeholder="3" />
          </Field>
          <Field label="Bathrooms" htmlFor="bathrooms" error={e.bathrooms}>
            <Input id="bathrooms" name="bathrooms" inputMode="numeric" defaultValue={v.bathrooms} placeholder="2" />
          </Field>
        </div>
        <Field label="Condition" htmlFor="condition" error={e.condition}>
          <Select id="condition" name="condition" defaultValue={v.condition || "good"}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <SubmitButton className="w-full" pendingText={say("Researching prices… up to a minute", "Nagre-research ng presyo… hanggang isang minuto")} disabled={!canRun || left === 0}>
          Check the price
        </SubmitButton>
        <p className="text-center text-xs text-muted tabular-nums">
          {left === null
            ? say("Unlimited price checks on your plan.", "Unlimited ang price checks sa plan mo.")
            : left === 0
              ? say(`All ${limit} price checks used this month. They renew on the 1st.`, `Nagamit na lahat ng ${limit} price checks ngayong buwan. Magre-renew sa a-uno.`)
              : say(`${left} of ${limit} price checks left this month.`, `${left} sa ${limit} price checks na lang ngayong buwan.`)}
        </p>
      </form>

      <div ref={reportRef} className="min-w-0 scroll-mt-24">
        {state.report ? (
          <PriceReport report={state.report} property={property} />
        ) : (
          <div className="grid h-full min-h-72 place-items-center rounded-[1.5rem] border-2 border-dashed border-grape-100 p-8 text-center">
            <div>
              <Icon3d name="money" size={72} className="mx-auto" />
              <p className="mt-3 text-lg font-bold">{say("Your price report shows up here", "Dito lalabas ang price report mo")}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                {say("A price range, the price per square meter, three asking prices to choose from, and a link to every comparable listing the AI used.", "Price range, presyo per square meter, tatlong asking price na mapagpipilian, at link sa bawat comparable listing na ginamit ng AI.")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The report. On a listing each option can be set as its price; on Add a Property, `onPick` puts it in the price field. */
export function PriceReport({ report, property, onPick }: { report: PricingReport; property: Property | null; onPick?: (priceMinor: number) => void }) {
  const say = useSay();
  const c = CONFIDENCE[report.confidence];
  const web = report.comparables.filter((x) => x.source === "web").length;
  return (
    <div className="pp-enter space-y-5">
      <section aria-labelledby="options-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="options-title" className="text-xl font-extrabold tracking-tight">
            Pick your asking price
          </h2>
          <span className={cx("rounded-full px-2.5 py-1 text-xs font-bold", c.tone)}>{c.label}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {OPTIONS.map((o) => (
            <div key={o.key} className={cx("flex flex-col rounded-[var(--radius-tile)] p-5", o.tile)}>
              <Icon3d name={o.icon} size={40} />
              <p className="mt-3 text-sm font-bold text-ink/80">{o.name}</p>
              <p className="mt-0.5 text-[1.6rem] leading-tight font-extrabold tracking-tight">{formatPeso(report.options[o.key])}</p>
              <p className="mt-1 flex-1 text-xs text-ink/70">{say(...o.note)}</p>
              {onPick ? (
                <button type="button" onClick={() => onPick(report.options[o.key])} className={cx(buttonClass("secondary"), "mt-4 w-full")}>
                  Use this price
                </button>
              ) : property ? (
                <form action={setAskingPrice.bind(null, property.id, report.options[o.key])} className="mt-4">
                  <SubmitButton variant="secondary" className="w-full" pendingText="Saving…">
                    Set as asking price
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          ))}
        </div>
        {property || onPick ? null : (
          <p className="mt-3 text-sm text-muted">
            {say("To set one of these on a listing, open the listing and choose", "Para i-set ang isa sa mga ito sa listing, buksan ang listing at piliin ang")}{" "}
            <span className="font-semibold text-ink">Check this price</span>
            {say(", or", ", o")}{" "}
            <Link href="/app/properties/new" className="font-bold text-grape-700 hover:underline">
              {say("add a property", "mag-add ng property")}
            </Link>{" "}
            {say("with the price you pick.", "gamit ang presyong napili mo.")}
          </p>
        )}
      </section>

      <section className="rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Estimated price range</dt>
            <dd className="mt-1 text-xl font-extrabold tracking-tight">
              {formatPeso(report.range.low)} to {formatPeso(report.range.high)}
            </dd>
            <dd className="mt-0.5 text-xs text-muted">
              {report.basis === "comparables"
                ? say(
                    `From ${report.pricePerSqm?.count} comparable listings with both a price and ${report.pricePerSqm?.of === "lot" ? "a lot area" : "an area"}.`,
                    `Mula sa ${report.pricePerSqm?.count} comparable listings na may presyo at ${report.pricePerSqm?.of === "lot" ? "lot area" : "area"}.`,
                  )
                : report.basis === "prices"
                  ? say("Most listings nearby didn't show an area, so this is the typical asking price of similar listings. Treat it as a guide.", "Karamihan ng listing sa malapit ay walang nakalagay na area, kaya ito ang karaniwang asking price ng mga katulad na listing. Gawin lang itong guide.")
                  : say("Too few similar listings are online here, so this is the AI's rough estimate. Treat it with care.", "Kaunti lang ang katulad na listing online dito, kaya rough estimate lang ito ng AI. Mag-ingat sa paggamit.")}
            </dd>
          </div>
          {report.pricePerSqm ? (
            <div>
              <dt className="text-sm text-muted">{report.pricePerSqm.of === "lot" ? "Price per square meter of lot nearby" : "Price per square meter nearby"}</dt>
              <dd className="mt-1 text-xl font-extrabold tracking-tight">{formatPeso(report.pricePerSqm.median)}</dd>
              <dd className="mt-0.5 text-xs text-muted tabular-nums">
                {say("Mostly between", "Kadalasan nasa pagitan ng")} {formatPeso(report.pricePerSqm.low)} {say("and", "at")} {formatPeso(report.pricePerSqm.high)}
              </dd>
            </div>
          ) : null}
        </dl>
        {report.adjustment.percent !== 0 && report.adjustment.reason ? (
          <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-sm">
            <span className="font-semibold">
              {report.adjustment.percent > 0 ? "+" : ""}
              {report.adjustment.percent}% for this property:
            </span>{" "}
            {report.adjustment.reason}
          </p>
        ) : null}
        {report.advantages.length ? (
          <div className="mt-4">
            <h3 className="text-sm font-bold">Location advantages</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink/85">
              {report.advantages.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {report.caveats.length ? (
          <ul className="mt-4 space-y-1 text-xs text-muted">
            {report.caveats.map((a) => (
              <li key={a}>Note: {a}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="comps-title">
        <h2 id="comps-title" className="text-lg font-extrabold tracking-tight">
          Similar properties listed now
        </h2>
        {report.comparedArea ? (
          <p className="mt-0.5 text-sm">
            {say("Compared with listings in", "Ikinumpara sa listings sa")} <span className="font-semibold">{report.comparedArea}</span>.
          </p>
        ) : null}
        <p className="mt-0.5 text-sm text-muted">
          {web} found online{report.comparables.length > web ? `, ${report.comparables.length - web} on MyHomeSeller` : ""}. Open any of them to check it yourself.
        </p>
        <ul className="mt-3 divide-y divide-line">
          {report.comparables.map((x) => (
            <li key={x.url} className="py-3">
              <a
                href={x.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex items-start justify-between gap-4 rounded-xl hover:bg-grape-50 sm:-mx-2 sm:px-2"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold group-hover:text-grape-700">
                    <span className="truncate">{x.title}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden />
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[x.location, x.areaSqm ? `${x.areaSqm.toLocaleString("en-PH")} sqm` : null, x.listed ? `listed ${x.listed}` : null, x.source === "myhomeseller" ? "on MyHomeSeller" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-sm font-bold">{formatPeso(x.priceMinor)}</span>
                  {x.pricePerSqmMinor ? <span className="block text-xs text-muted">{formatPeso(x.pricePerSqmMinor)} / sqm</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded-xl bg-tile-lemon px-4 py-3 text-xs text-ink/80">{PRICING_DISCLAIMER}</p>
    </div>
  );
}
