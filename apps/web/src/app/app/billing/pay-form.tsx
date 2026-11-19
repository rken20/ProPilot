"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPeso } from "@/lib/money";
import { submitGcashPayment, type PayState } from "./actions";

/** Pay with GCash: send the amount, then report the reference number for checking. */
export function GcashPayForm({
  plan,
  priceMinor,
  gcashNumber,
  gcashName,
}: {
  plan: { code: string; name: string };
  priceMinor: number;
  gcashNumber: string;
  gcashName: string;
}) {
  const [state, action] = useActionState<PayState, FormData>(submitGcashPayment, {});
  const [months, setMonths] = useState(1);
  const total = priceMinor * months;

  if (state.sent) {
    return (
      <Alert tone="success">
        Thanks! We received your payment details. We&apos;ll check the payment in GCash and turn on {plan.name}, usually within a day. You&apos;ll get
        an email when it&apos;s done.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="plan" value={plan.code} />
      {state.error ? <Alert>{state.error}</Alert> : null}

      <Field label="How many months" htmlFor="months">
        <Select id="months" name="months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => (
            <option key={m} value={m}>
              {m} month{m === 1 ? "" : "s"}: {formatPeso(priceMinor * m)}
            </option>
          ))}
        </Select>
      </Field>

      <ol className="space-y-4 text-sm">
        <li className="rounded-xl bg-surface p-4">
          <p className="font-semibold">1. Send {formatPeso(total)} by GCash</p>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1">
            <dt className="text-muted">GCash number</dt>
            <dd className="font-semibold tabular-nums">{gcashNumber}</dd>
            <dt className="text-muted">Account name</dt>
            <dd className="font-semibold">{gcashName}</dd>
            <dt className="text-muted">Amount</dt>
            <dd className="font-semibold tabular-nums">{formatPeso(total)}</dd>
          </dl>
          <p className="mt-2 text-muted">In GCash, choose Send Money, then Express Send.</p>
        </li>
        <li className="rounded-xl bg-surface p-4">
          <p className="font-semibold">2. Tell us the payment details</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Reference number" htmlFor="reference" hint="13 digits, on your GCash receipt">
              <Input id="reference" name="reference" inputMode="numeric" autoComplete="off" required placeholder="1012 345 678901" maxLength={20} />
            </Field>
            <Field label="Name on your GCash account" htmlFor="payerName">
              <Input id="payerName" name="payerName" autoComplete="name" required maxLength={120} placeholder="e.g. JUAN D." />
            </Field>
          </div>
        </li>
      </ol>

      <SubmitButton pendingText="Sending…">I&apos;ve paid, send for checking</SubmitButton>
      <p className="text-xs text-muted">We check each payment by hand. Your plan starts when we confirm it, not when you send it.</p>
    </form>
  );
}
