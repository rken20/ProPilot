"use client";

import { useState } from "react";
import { amortize } from "@propilot/shared";
import { formatPeso } from "@/lib/money";

export function LoanEstimator({ priceMinor, defaultDownpayment }: { priceMinor: number; defaultDownpayment?: number }) {
  const [down, setDown] = useState(String(defaultDownpayment ?? 20));
  const [rate, setRate] = useState("6.5");
  const [years, setYears] = useState("20");

  let result: ReturnType<typeof amortize> | null = null;
  try {
    result = amortize({ priceMinor, downpaymentPercent: Number(down), annualRatePercent: Number(rate), years: Number(years) });
  } catch {
    result = null;
  }

  const field = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

  return (
    <section className="rounded-2xl border border-line bg-white p-5" aria-label="Monthly payment estimate">
      <h2 className="font-semibold">Estimate your monthly payment</h2>
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
        <div className="mt-4 rounded-xl bg-surface p-4">
          <p className="text-sm text-muted">Estimated monthly payment</p>
          <p className="text-2xl font-bold tabular-nums">{formatPeso(result.monthlyMinor)}</p>
          <p className="mt-1 text-xs text-muted">
            Downpayment {formatPeso(result.downpaymentMinor)}, loan {formatPeso(result.loanMinor)} over {result.months} months.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-red-700">Enter a downpayment from 0 to 100%, a rate from 0 to 50%, and a term from 1 to 40 years.</p>
      )}
      <p className="mt-3 text-xs text-muted">
        This is an estimate. Your bank or Pag-IBIG sets the actual rate and terms.
      </p>
    </section>
  );
}
