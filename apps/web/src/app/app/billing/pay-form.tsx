"use client";

import { useSay } from "@/components/lang";
import { Minus, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert, Field, Input, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPeso } from "@/lib/money";
import { MAX_MONTHS, QUICK_MONTHS, paidUntil } from "@/lib/plan-rules";
import { submitGcashPayment, type PayState } from "./actions";

const day = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

/**
 * Choose a plan and how many months to pay for, then pay with GCash: send the
 * amount and report the reference number for checking. Without `gcash` the
 * choices and the total still show, so the owner sees what a plan costs.
 */
export function GcashPayForm({
  plans,
  defaultCode,
  current,
  gcash,
  action: payAction = submitGcashPayment,
}: {
  action?: (prev: PayState, form: FormData) => Promise<PayState>;
  /** The paid plans to choose from, cheapest first. */
  plans: Array<{ code: string; name: string; priceMinor: number }>;
  defaultCode?: string;
  /** The plan the business is on now, to show when the new months would end. */
  current: { code: string; periodEnd: string | null };
  /** Where to send the money. Missing until GCash payments are set up. */
  gcash: { number: string; name: string } | null;
}) {
  const [state, action] = useActionState<PayState, FormData>(payAction, {});
  const [months, setMonths] = useState(1);
  const say = useSay();
  const [code, setCode] = useState(defaultCode && plans.some((p) => p.code === defaultCode) ? defaultCode : plans[0]!.code);
  // Read the clock once, when the form opens: the date below is an estimate either way.
  const [now] = useState(() => new Date());
  const plan = plans.find((p) => p.code === code) ?? plans[0]!;
  const priceMinor = plan.priceMinor;
  const total = priceMinor * months;
  const { until, addsOn } = paidUntil(now, current, plan.code, months);
  const monthsText = `${months} month${months === 1 ? "" : "s"}`;

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

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{say("How many months", "Ilang months")}</legend>
        <input type="hidden" name="months" value={months} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="inline-flex items-center rounded-full border border-line bg-white p-1">
            <button
              type="button"
              onClick={() => setMonths((m) => Math.max(1, m - 1))}
              disabled={months <= 1}
              aria-label={say("One month less", "Bawasan ng isang month")}
              className="grid size-10 place-items-center rounded-full text-grape-700 hover:bg-grape-50 disabled:text-zinc-300 disabled:hover:bg-transparent"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <output className="min-w-[7.5rem] text-center text-base font-extrabold tabular-nums" aria-live="polite">
              {monthsText}
            </output>
            <button
              type="button"
              onClick={() => setMonths((m) => Math.min(MAX_MONTHS, m + 1))}
              disabled={months >= MAX_MONTHS}
              aria-label={say("One month more", "Dagdagan ng isang month")}
              className="grid size-10 place-items-center rounded-full text-grape-700 hover:bg-grape-50 disabled:text-zinc-300 disabled:hover:bg-transparent"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={say("Common choices", "Mga karaniwang pili")}>
            {QUICK_MONTHS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === months}
                onClick={() => setMonths(m)}
                className={cx(
                  "min-h-10 rounded-full border px-4 text-sm font-bold transition-colors",
                  m === months ? "border-frame-1 bg-frame-1 text-white" : "border-line bg-white text-ink hover:border-grape-300 hover:bg-grape-50",
                )}
              >
                {m === 12 ? say("1 year", "1 taon") : `${m} mo`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-tile-sky p-4 text-sm">
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-ink/80">
              {plan.name}: {formatPeso(priceMinor)} × {monthsText}
            </span>
            <span className="text-xl font-extrabold tabular-nums">{formatPeso(total)}</span>
          </p>
          <p className="mt-1.5 text-ink/80">
            {addsOn
              ? say(`Added to the end of your current plan: paid until ${day.format(until)}.`, `Idadagdag sa dulo ng plan mo ngayon: bayad hanggang ${day.format(until)}.`)
              : say(
                  `Runs for ${monthsText} from the day we confirm your payment. Confirmed today, that is until ${day.format(until)}.`,
                  `Tatakbo nang ${monthsText} mula sa araw na ma-confirm ang bayad mo. Kung ngayon ma-confirm, hanggang ${day.format(until)} iyon.`,
                )}
          </p>
        </div>
      </fieldset>

      <GcashSteps total={total} gcash={gcash} kind="plan" />
    </form>
  );
}

/**
 * Send the money by GCash, then report the reference number for checking. Used
 * for plans and for AI credit packs. Without `gcash`, says payments aren't set up.
 */
export function GcashSteps({
  total,
  gcash,
  kind,
}: {
  total: number;
  gcash: { number: string; name: string } | null;
  kind: "plan" | "credits";
}) {
  const say = useSay();
  return (
    <>
      {gcash ? (
        <>
          <ol className="space-y-4 text-sm">
            <li className="rounded-xl bg-surface p-4">
              <p className="font-semibold">1. Send {formatPeso(total)} by GCash</p>
              <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1">
                <dt className="text-muted">GCash number</dt>
                <dd className="font-semibold tabular-nums">{gcash.number}</dd>
                <dt className="text-muted">Account name</dt>
                <dd className="font-semibold">{gcash.name}</dd>
                <dt className="text-muted">Amount</dt>
                <dd className="font-semibold tabular-nums">{formatPeso(total)}</dd>
              </dl>
              <p className="mt-2 text-muted">{say("In GCash, choose Send Money, then Express Send.", "Sa GCash, piliin ang Send Money, tapos Express Send.")}</p>
            </li>
            <li className="rounded-xl bg-surface p-4">
              <p className="font-semibold">2. Tell us the payment details</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Reference number"
                  htmlFor={`${kind}-reference`}
                  hint={say(
                    "13 digits, on your GCash receipt",
                    "13 digits, nasa GCash receipt mo",
                  )}
                >
                  <Input
                    id={`${kind}-reference`}
                    name="reference"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    placeholder="1012 345 678901"
                    maxLength={20}
                  />
                </Field>
                <Field
                  label="Name on your GCash account"
                  htmlFor={`${kind}-payerName`}
                >
                  <Input
                    id={`${kind}-payerName`}
                    name="payerName"
                    autoComplete="name"
                    required
                    maxLength={120}
                    placeholder="e.g. JUAN D."
                  />
                </Field>
              </div>
            </li>
          </ol>

          <SubmitButton pendingText="Sending…">I&apos;ve paid, send for checking</SubmitButton>
          <p className="text-xs text-muted">
            {kind === "plan"
              ? say(
                  "We check each payment by hand. Your plan starts when we confirm it, not when you send it.",
                  "Mano-mano naming chine-check ang bawat payment. Magsisimula ang plan mo kapag na-confirm na namin, hindi pag-send mo.",
                )
              : say(
                  "We check each payment by hand. Your credits are added when we confirm it, not when you send it.",
                  "Mano-mano naming chine-check ang bawat payment. Madadagdag ang credits mo kapag na-confirm na namin, hindi pag-send mo.",
                )}
          </p>
        </>
      ) : (
        <Alert tone="info">{say("GCash payments aren't set up yet, so you can't pay here today. Please check back soon.", "Hindi pa naka-set up ang GCash payments, kaya hindi ka pa makakabayad dito ngayon. Paki-check ulit soon.")}</Alert>
      )}
    </>
  );
}
