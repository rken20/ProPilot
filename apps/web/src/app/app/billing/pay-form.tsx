"use client";

import { useSay } from "@/components/lang";
import { useActionState, useState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPeso } from "@/lib/money";
import { submitGcashPayment, type PayState } from "./actions";

/** Pay with GCash: send the amount, then report the reference number for checking. */
export function GcashPayForm({
  plans,
  defaultCode,
  gcashNumber,
  gcashName,
  action: payAction = submitGcashPayment,
}: {
  action?: (prev: PayState, form: FormData) => Promise<PayState>;
  /** The paid plans to choose from, cheapest first. */
  plans: Array<{ code: string; name: string; priceMinor: number }>;
  defaultCode?: string;
  gcashNumber: string;
  gcashName: string;
}) {
  const [state, action] = useActionState<PayState, FormData>(payAction, {});
  const [months, setMonths] = useState(1);
  const say = useSay();
  const [code, setCode] = useState(defaultCode && plans.some((p) => p.code === defaultCode) ? defaultCode : plans[0]!.code);
  const plan = plans.find((p) => p.code === code) ?? plans[0]!;
  const priceMinor = plan.priceMinor;
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
      {state.error ? <Alert>{state.error}</Alert> : null}

      {plans.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Plan</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {plans.map((p) => (
              <label
                key={p.code}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
              >
                <span className="flex items-center gap-2.5">
                  <input type="radio" name="plan" value={p.code} checked={p.code === code} onChange={() => setCode(p.code)} className="accent-[var(--color-brand-600)]" />
                  <span className="font-semibold">{p.name}</span>
                </span>
                <span className="tabular-nums text-muted">{formatPeso(p.priceMinor)} / month</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="plan" value={plan.code} />
      )}

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
          <p className="mt-2 text-muted">{say("In GCash, choose Send Money, then Express Send.", "Sa GCash, piliin ang Send Money, tapos Express Send.")}</p>
        </li>
        <li className="rounded-xl bg-surface p-4">
          <p className="font-semibold">2. Tell us the payment details</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Reference number" htmlFor="reference" hint={say("13 digits, on your GCash receipt", "13 digits, nasa GCash receipt mo")}>
              <Input id="reference" name="reference" inputMode="numeric" autoComplete="off" required placeholder="1012 345 678901" maxLength={20} />
            </Field>
            <Field label="Name on your GCash account" htmlFor="payerName">
              <Input id="payerName" name="payerName" autoComplete="name" required maxLength={120} placeholder="e.g. JUAN D." />
            </Field>
          </div>
        </li>
      </ol>

      <SubmitButton pendingText="Sending…">I&apos;ve paid, send for checking</SubmitButton>
      <p className="text-xs text-muted">{say("We check each payment by hand. Your plan starts when we confirm it, not when you send it.", "Mano-mano naming chine-check ang bawat payment. Magsisimula ang plan mo kapag na-confirm na namin, hindi pag-send mo.")}</p>
    </form>
  );
}
