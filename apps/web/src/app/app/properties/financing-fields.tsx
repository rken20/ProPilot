"use client";

import { useEffect, useState } from "react";
import {
  FINANCING_OPTIONS,
  financingPlan,
  type FinancingKey,
} from "@propilot/shared";
import { useSay } from "@/components/lang";
import { Icon3d } from "@/components/icon-3d";
import { Input, Label, cx } from "@/components/ui";
import { formatPeso, pesosToCentavos } from "@/lib/money";

/** The form's field names for one option's terms. */
export const TERM_FIELDS = {
  bank: {
    down: "bankDown",
    rate: "bankRate",
    years: "bankYears",
    downMonths: null,
  },
  pagibig: {
    down: "pagibigDown",
    rate: "pagibigRate",
    years: "pagibigYears",
    downMonths: null,
  },
  inHouse: {
    down: "inHouseDown",
    rate: "inHouseRate",
    years: "inHouseYears",
    downMonths: "inHouseDownMonths",
  },
} as const satisfies Record<
  FinancingKey,
  { down: string; rate: string; years: string; downMonths: string | null }
>;

const TERM_NAMES = Object.values(TERM_FIELDS)
  .flatMap((f) => [f.down, f.rate, f.years, f.downMonths])
  .filter((n) => n !== null) as string[];

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const round = (minor: number) => formatPeso(Math.round(minor / 100) * 100);

/**
 * Financing on the property form: tick the options offered, enter each one's
 * terms, and see what a buyer would pay at the selling price typed above.
 * Empty terms are computed with example figures, and say so.
 */
export function FinancingFields({
  values: v,
  errors: e,
  readOnly,
}: {
  values: Record<string, string>;
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const say = useSay();
  const [on, setOn] = useState<Record<FinancingKey, boolean>>({
    bank: v.bankFinancing === "on",
    pagibig: v.pagIbig === "on",
    inHouse: v.inHouse === "on",
  });
  const [t, setT] = useState<Record<string, string>>(() =>
    Object.fromEntries(TERM_NAMES.map((n) => [n, v[n] ?? ""])),
  );
  const [priceMinor, setPriceMinor] = useState<number | null>(() =>
    pesosToCentavos(v.price ?? ""),
  );

  // Follow the selling price as it is typed (or filled in by the Pricing Advisor).
  useEffect(() => {
    const el = document.getElementById("price") as HTMLInputElement | null;
    if (!el) return;
    const read = () => setPriceMinor(pesosToCentavos(el.value));
    read();
    el.addEventListener("input", read);
    return () => el.removeEventListener("input", read);
  }, []);

  const price =
    priceMinor !== null && Number.isFinite(priceMinor) && priceMinor > 0
      ? priceMinor
      : null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-sm font-medium text-zinc-800">Financing options</p>
        <p className="text-sm text-muted">
          {say(
            "Tick what a buyer can use, then add your terms. Buyers see the monthly payment on the listing's page, and the AI can quote it.",
            "I-tick ang pwedeng gamitin ng buyer, tapos ilagay ang terms mo. Makikita ng buyers ang monthly payment sa page ng listing, at pwede itong sabihin ng AI.",
          )}
        </p>
      </div>
      <div className="space-y-3">
        {FINANCING_OPTIONS.map((o) => {
          const f = TERM_FIELDS[o.key];
          const terms = {
            downPercent: num(t[f.down]!),
            ratePercent: num(t[f.rate]!),
            years: num(t[f.years]!),
            downMonths: f.downMonths ? num(t[f.downMonths]!) : undefined,
          };
          const plan =
            on[o.key] && price ? financingPlan(price, o.key, terms) : null;
          const field = (
            name: string,
            label: string,
            placeholder: string,
            mode: "decimal" | "numeric" = "decimal",
          ) => (
            <div>
              <Label htmlFor={name} className="text-xs text-muted">
                {label}
              </Label>
              <Input
                id={name}
                name={name}
                inputMode={mode}
                value={t[name]}
                onChange={(ev) =>
                  setT((x) => ({ ...x, [name]: ev.target.value }))
                }
                placeholder={placeholder}
                aria-invalid={e[name] ? true : undefined}
                readOnly={readOnly}
              />
              {e[name] ? (
                <p className="mt-1 text-xs text-red-700">{e[name]}</p>
              ) : null}
            </div>
          );
          return (
            <div
              key={o.key}
              className={cx(
                "rounded-2xl border p-4 transition-colors",
                on[o.key]
                  ? "border-brand-100 bg-tile-sky/50"
                  : "border-line bg-white",
              )}
            >
              <Label className="flex items-center gap-2.5 font-semibold">
                <input
                  type="checkbox"
                  name={o.flag}
                  checked={on[o.key]}
                  onChange={(ev) =>
                    setOn((x) => ({ ...x, [o.key]: ev.target.checked }))
                  }
                  disabled={readOnly}
                  className="size-4 accent-brand-600"
                />
                {o.label}
              </Label>
              {on[o.key] ? (
                <>
                  <div
                    className={cx(
                      "mt-3 grid grid-cols-2 gap-3",
                      f.downMonths ? "sm:grid-cols-4" : "sm:grid-cols-3",
                    )}
                  >
                    {field(
                      f.down,
                      "Downpayment (%)",
                      String(o.example.downPercent),
                    )}
                    {field(
                      f.rate,
                      say("Interest a year (%)", "Interest kada taon (%)"),
                      String(o.example.ratePercent),
                    )}
                    {field(
                      f.years,
                      say("Years to pay", "Ilang taon babayaran"),
                      String(o.example.years),
                      "numeric",
                    )}
                    {f.downMonths
                      ? field(
                          f.downMonths,
                          say(
                            "Downpayment in (months)",
                            "Downpayment sa (months)",
                          ),
                          say("At once", "Isang bagsak"),
                          "numeric",
                        )
                      : null}
                  </div>
                  {plan ? (
                    <div className="mt-3 flex gap-3 rounded-xl bg-white p-3.5 text-sm">
                      <Icon3d
                        name="money"
                        size={26}
                        className="shrink-0 self-start"
                      />
                      <div className="min-w-0">
                        <p className="text-lg leading-tight font-extrabold tabular-nums">
                          {round(plan.monthlyMinor)}{" "}
                          <span className="text-sm font-semibold text-muted">
                            {say(
                              `a month for ${plan.years} years`,
                              `kada buwan sa loob ng ${plan.years} taon`,
                            )}
                          </span>
                        </p>
                        <p className="mt-1 text-ink/80">
                          {say(
                            `Downpayment ${formatPeso(plan.downpaymentMinor)} (${plan.downPercent}%)`,
                            `Downpayment ${formatPeso(plan.downpaymentMinor)} (${plan.downPercent}%)`,
                          )}
                          {plan.downMonthlyMinor
                            ? say(
                                `, or ${round(plan.downMonthlyMinor)} a month for ${plan.downMonths} months`,
                                `, o ${round(plan.downMonthlyMinor)} kada buwan sa loob ng ${plan.downMonths} months`,
                              )
                            : ""}
                          {say(
                            `. Loan ${formatPeso(plan.loanMinor)} at ${plan.ratePercent}% a year.`,
                            `. Loan na ${formatPeso(plan.loanMinor)} sa ${plan.ratePercent}% kada taon.`,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {say(
                            `Rough guide: fits a buyer earning about ${round(plan.incomeGuideMinor)} a month (payment at 35% of income).`,
                            `Rough guide: bagay sa buyer na kumikita ng mga ${round(plan.incomeGuideMinor)} kada buwan (35% ng income ang bayad).`,
                          )}{" "}
                          {plan.sellerSet
                            ? ""
                            : say(
                                "Uses example figures where a box is empty. Fill in your interest and years so buyers see your real terms.",
                                "Example figures ang gamit kung walang laman ang box. Ilagay ang interest at taon mo para totoong terms ang makita ng buyers.",
                              )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted">
                      {price
                        ? say(
                            "Check the numbers: downpayment 0 to 100%, interest 0 to 50%, 1 to 40 years.",
                            "I-check ang numbers: downpayment 0 hanggang 100%, interest 0 hanggang 50%, 1 hanggang 40 taon.",
                          )
                        : say(
                            "Enter the selling price above to see the monthly payment.",
                            "Ilagay ang selling price sa itaas para makita ang monthly payment.",
                          )}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <div>
        <Label htmlFor="financingNotes">Financing notes</Label>
        <Input
          id="financingNotes"
          name="financingNotes"
          defaultValue={v.financingNotes}
          readOnly={readOnly}
          placeholder={say(
            "e.g. 5% discount for spot cash",
            "hal. 5% discount sa spot cash",
          )}
        />
        <p className="mt-1 text-xs text-muted">
          {say(
            "Other terms the assistant may quote.",
            "Iba pang terms na pwedeng sabihin ng assistant.",
          )}
        </p>
      </div>
    </section>
  );
}
