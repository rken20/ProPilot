"use client";

import { useSay } from "@/components/lang";
import { useState } from "react";
import { INCOME_SHARE, amortize, type FinancingPlan } from "@propilot/shared";
import { cx } from "@/components/ui";
import { formatPeso } from "@/lib/money";

const round = (minor: number) => formatPeso(Math.round(minor / 100) * 100);

/**
 * The monthly payment on a listing's public page. One tab per financing option
 * the seller offers, starting from the seller's terms where they gave them;
 * the buyer can change any number. With no options, a general example.
 */
export function LoanEstimator({ priceMinor, plans, defaultDownpayment }: { priceMinor: number; plans: FinancingPlan[]; defaultDownpayment?: number }) {
  const say = useSay();
  const first = plans[0];
  const [key, setKey] = useState(first?.key ?? null);
  const [down, setDown] = useState(String(first?.downPercent ?? defaultDownpayment ?? 20));
  const [rate, setRate] = useState(String(first?.ratePercent ?? 6.5));
  const [years, setYears] = useState(String(first?.years ?? 20));
  const plan = plans.find((p) => p.key === key) ?? null;
  // "Seller's terms" holds only while the numbers are still the seller's.
  const untouched = plan !== null && Number(down) === plan.downPercent && Number(rate) === plan.ratePercent && Number(years) === plan.years;

  const pick = (p: FinancingPlan) => {
    setKey(p.key);
    setDown(String(p.downPercent));
    setRate(String(p.ratePercent));
    setYears(String(p.years));
  };

  let result: ReturnType<typeof amortize> | null = null;
  try {
    result = amortize({ priceMinor, downpaymentPercent: Number(down), annualRatePercent: Number(rate), years: Number(years) });
  } catch {
    result = null;
  }

  const field = "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums outline-none transition-[border-color,box-shadow] focus:border-brand-600 focus:ring-4 focus:ring-brand-100";

  return (
    <section className="rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)]" aria-label="Monthly payment estimate">
      <h2 className="text-lg font-bold">Estimate your monthly payment</h2>
      {plans.length ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={say("Financing option", "Financing option")}>
          {plans.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={p.key === key}
              onClick={() => pick(p)}
              className={cx("min-h-10 rounded-full border px-4 text-sm font-bold transition-colors", p.key === key ? "border-frame-1 bg-frame-1 text-white" : "border-line bg-white text-ink hover:border-grape-300 hover:bg-grape-50")}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <label className="text-xs font-medium text-muted">
          Downpayment %
          <input inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} className={field} />
        </label>
        <label className="text-xs font-medium text-muted">
          Interest %
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={field} />
        </label>
        <label className="text-xs font-medium text-muted">
          Years
          <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} className={field} />
        </label>
      </div>
      {result ? (
        <div className="mt-4 rounded-xl bg-sand p-4">
          <p className="text-sm text-muted">
            Estimated monthly payment
            {plan ? (
              <span className={cx("ml-2 rounded-full px-2 py-0.5 text-xs font-semibold", untouched && plan.sellerSet ? "bg-brand-50 text-brand-700" : "bg-grape-50 text-grape-700")}>
                {untouched && plan.sellerSet ? say("Seller's terms", "Terms ng seller") : untouched ? say("Example figures", "Example figures") : say("Your figures", "Figures mo")}
              </span>
            ) : null}
          </p>
          <p className="font-display text-3xl font-medium tabular-nums">{round(result.monthlyMinor)}</p>
          <p className="mt-1 text-xs text-muted">
            {say(
              `Downpayment ${formatPeso(result.downpaymentMinor)}, loan ${formatPeso(result.loanMinor)} over ${result.months} months.`,
              `Downpayment ${formatPeso(result.downpaymentMinor)}, loan ${formatPeso(result.loanMinor)} sa loob ng ${result.months} months.`,
            )}
            {untouched && plan?.downMonthlyMinor
              ? " " + say(`The downpayment can be paid over ${plan.downMonths} months, about ${round(plan.downMonthlyMinor)} a month.`, `Pwedeng bayaran ang downpayment sa loob ng ${plan.downMonths} months, mga ${round(plan.downMonthlyMinor)} kada buwan.`)
              : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            {say(
              `Rough guide: this fits a monthly income of about ${round(result.monthlyMinor / INCOME_SHARE)} (payment at 35% of income).`,
              `Rough guide: bagay ito sa monthly income na mga ${round(result.monthlyMinor / INCOME_SHARE)} (35% ng income ang bayad).`,
            )}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-red-700">{say("Enter a downpayment from 0 to 100%, a rate from 0 to 50%, and a term from 1 to 40 years.", "Maglagay ng downpayment na 0 hanggang 100%, rate na 0 hanggang 50%, at term na 1 hanggang 40 taon.")}</p>
      )}
      <p className="mt-3 text-xs text-muted">
        {say("This is an estimate. The bank, Pag-IBIG or the seller sets the actual rate and terms.", "Estimate lang ito. Ang bank, Pag-IBIG o ang seller ang magse-set ng totoong rate at terms.")}
      </p>
    </section>
  );
}
