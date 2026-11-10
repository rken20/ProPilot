/**
 * Loan estimate. Computed by code, never by the AI, so figures are exact for
 * the inputs given. All money is integer centavos.
 */
export type AmortizationInput = {
  priceMinor: number;
  downpaymentPercent: number; // 0–100
  annualRatePercent: number; // e.g. 6.5
  years: number; // 1–40
};

export type AmortizationResult = {
  downpaymentMinor: number;
  loanMinor: number;
  monthlyMinor: number;
  months: number;
  totalInterestMinor: number;
};

export function amortize({ priceMinor, downpaymentPercent, annualRatePercent, years }: AmortizationInput): AmortizationResult {
  if (!(priceMinor >= 0) || !(downpaymentPercent >= 0 && downpaymentPercent <= 100)) {
    throw new RangeError("price and downpayment must be valid");
  }
  if (!(annualRatePercent >= 0 && annualRatePercent <= 50) || !(years >= 1 && years <= 40)) {
    throw new RangeError("rate must be 0–50% and term 1–40 years");
  }
  const downpaymentMinor = Math.round((priceMinor * downpaymentPercent) / 100);
  const loanMinor = priceMinor - downpaymentMinor;
  const months = Math.round(years * 12);
  const r = annualRatePercent / 100 / 12;
  const monthly = r === 0 ? loanMinor / months : (loanMinor * r) / (1 - Math.pow(1 + r, -months));
  const monthlyMinor = Math.round(monthly);
  return {
    downpaymentMinor,
    loanMinor,
    monthlyMinor,
    months,
    totalInterestMinor: Math.max(0, monthlyMinor * months - loanMinor),
  };
}
