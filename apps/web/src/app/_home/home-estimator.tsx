"use client";

import { useId, useState } from "react";
import { amortize } from "@propilot/shared";
import { formatPeso } from "@/lib/money";
import { Photo } from "@/components/photo";

/** A working loan estimate on the home page, the same math buyers get on every listing. */
export function HomeEstimator() {
  const [price, setPrice] = useState(4_800_000);
  const [down, setDown] = useState(20);
  const [years, setYears] = useState(25);
  const [rate, setRate] = useState(6.25);

  const result = amortize({
    priceMinor: price * 100,
    downpaymentPercent: down,
    annualRatePercent: rate,
    years,
  });

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-[var(--shadow-lift)]">
      <div className="aspect-[12/5] overflow-hidden bg-sand">
        <Photo
          name="house-exterior"
          widths={[640, 1040, 1400]}
          sizes="(min-width: 1024px) 560px, 100vw"
          className="size-full object-cover object-[50%_40%]"
        />
      </div>
      <div className="p-6 sm:p-8">
        <div className="space-y-5">
          <Slider
            label="Price"
            value={price}
            min={1_000_000}
            max={20_000_000}
            step={100_000}
            onChange={setPrice}
            display={formatPeso(price * 100)}
          />
          <Slider
            label="Downpayment"
            value={down}
            min={0}
            max={50}
            step={5}
            onChange={setDown}
            display={`${down}%`}
          />
          <Slider
            label="Loan term"
            value={years}
            min={5}
            max={30}
            step={1}
            onChange={setYears}
            display={`${years} years`}
          />
          <Slider
            label="Interest rate"
            value={rate}
            min={3}
            max={12}
            step={0.25}
            onChange={setRate}
            display={`${rate.toFixed(2)}%`}
          />
        </div>
        <div className="mt-7 rounded-2xl bg-sand px-5 py-5 sm:px-6">
          <p className="text-sm text-muted">Estimated monthly payment</p>
          <p
            className="font-display mt-1 text-4xl font-medium tabular-nums text-ink sm:text-5xl"
            aria-live="polite"
          >
            {formatPeso(Math.round(result.monthlyMinor / 100) * 100)}
          </p>
          <p className="mt-2 text-sm text-muted">
            Loan of {formatPeso(result.loanMinor)} after{" "}
            {formatPeso(result.downpaymentMinor)} down.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-ink">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-11 w-full cursor-pointer accent-brand-600"
      />
    </div>
  );
}
