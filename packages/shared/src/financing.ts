import { amortize } from "./amortization";

/**
 * Financing a seller offers on a listing, with the terms a buyer would pay
 * under each option. Stored inside the listing's `financing` JSON.
 */
export const FINANCING_OPTIONS = [
  {
    key: "bank",
    flag: "bankFinancing",
    label: "Bank financing",
    example: { downPercent: 20, ratePercent: 7.5, years: 20 },
  },
  {
    key: "pagibig",
    flag: "pagIbig",
    label: "Pag-IBIG",
    example: { downPercent: 10, ratePercent: 6.25, years: 30 },
  },
  {
    key: "inHouse",
    flag: "inHouse",
    label: "In-house financing",
    example: { downPercent: 20, ratePercent: 12, years: 10 },
  },
] as const;

export type FinancingKey = (typeof FINANCING_OPTIONS)[number]["key"];

export type FinancingTerms = {
  downPercent?: number;
  /** Interest a year, in percent. */
  ratePercent?: number;
  years?: number;
  /** In-house: the downpayment can be paid over this many months. */
  downMonths?: number;
};

export type FinancingInfo = {
  bankFinancing?: boolean;
  pagIbig?: boolean;
  inHouse?: boolean;
  /** The lowest downpayment among the options offered. */
  downpaymentPercent?: number;
  notes?: string;
  terms?: Partial<Record<FinancingKey, FinancingTerms>>;
};

/** Lenders commonly want the monthly payment at or under about this share of income. A rough guide only. */
export const INCOME_SHARE = 0.35;

export type FinancingPlan = {
  key: FinancingKey;
  label: string;
  downPercent: number;
  ratePercent: number;
  years: number;
  downMonths: number | null;
  /** The seller entered the interest rate and the years; otherwise those are example figures. */
  sellerSet: boolean;
  downpaymentMinor: number;
  loanMinor: number;
  monthlyMinor: number;
  months: number;
  /** The downpayment spread over `downMonths`, when the seller allows that. */
  downMonthlyMinor: number | null;
  /** Monthly income at which the payment is about 35% of income. */
  incomeGuideMinor: number;
};

/** One option's figures for a price, using example figures where the seller left a term empty. Null if a number is out of range. */
export function financingPlan(
  priceMinor: number,
  key: FinancingKey,
  terms: FinancingTerms = {},
  fallbackDownPercent?: number,
): FinancingPlan | null {
  const option = FINANCING_OPTIONS.find((o) => o.key === key)!;
  const downPercent =
    terms.downPercent ?? fallbackDownPercent ?? option.example.downPercent;
  const ratePercent = terms.ratePercent ?? option.example.ratePercent;
  const years = terms.years ?? option.example.years;
  const downMonths =
    key === "inHouse" && terms.downMonths ? terms.downMonths : null;
  try {
    const r = amortize({
      priceMinor,
      downpaymentPercent: downPercent,
      annualRatePercent: ratePercent,
      years,
    });
    return {
      key,
      label: option.label,
      downPercent,
      ratePercent,
      years,
      downMonths,
      sellerSet: terms.ratePercent !== undefined && terms.years !== undefined,
      downpaymentMinor: r.downpaymentMinor,
      loanMinor: r.loanMinor,
      monthlyMinor: r.monthlyMinor,
      months: r.months,
      downMonthlyMinor: downMonths
        ? Math.round(r.downpaymentMinor / downMonths)
        : null,
      incomeGuideMinor: Math.round(r.monthlyMinor / INCOME_SHARE),
    };
  } catch {
    return null;
  }
}

/** The figures for every option the listing offers, in a fixed order. */
export function financingPlans(
  priceMinor: number,
  financing: FinancingInfo | null | undefined,
): FinancingPlan[] {
  const f = financing ?? {};
  return FINANCING_OPTIONS.filter((o) => f[o.flag]).flatMap((o) => {
    const plan = financingPlan(
      priceMinor,
      o.key,
      f.terms?.[o.key],
      f.downpaymentPercent,
    );
    return plan ? [plan] : [];
  });
}

/** The lowest downpayment the seller stated among the options offered, if any. */
export function lowestDownPercent(
  financing: FinancingInfo,
): number | undefined {
  const stated = FINANCING_OPTIONS.filter((o) => financing[o.flag]).flatMap(
    (o) => {
      const d = financing.terms?.[o.key]?.downPercent;
      return d === undefined ? [] : [d];
    },
  );
  return stated.length ? Math.min(...stated) : undefined;
}
