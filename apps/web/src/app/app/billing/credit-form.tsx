"use client";

import { useSay } from "@/components/lang";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { formatPeso } from "@/lib/money";
import {
  creditsLabel,
  packBuys,
  perThousand,
  type CreditPack,
} from "@/lib/credit-rules";
import { submitCreditPayment, type PayState } from "./actions";
import { GcashSteps } from "./pay-form";

/** Choose an AI credit pack, then pay with GCash and report the reference for checking. */
export function CreditPackForm({
  packs,
  gcash,
  action: payAction = submitCreditPayment,
}: {
  packs: CreditPack[];
  gcash: { number: string; name: string } | null;
  action?: (prev: PayState, form: FormData) => Promise<PayState>;
}) {
  const say = useSay();
  const [state, action] = useActionState<PayState, FormData>(payAction, {});
  const [code, setCode] = useState(packs[0]!.code);
  const pack = packs.find((p) => p.code === code) ?? packs[0]!;
  const base = perThousand(packs[0]!);

  if (state.sent) {
    return (
      <Alert tone="success">
        {say(
          `Thanks! We received your payment details. We'll check the payment in GCash and add ${creditsLabel(pack.credits)}, usually within a day. You'll get an email when it's done.`,
          `Salamat! Natanggap namin ang payment details mo. Iche-check namin ang bayad sa GCash at idadagdag ang ${creditsLabel(pack.credits)}, kadalasan sa loob ng isang araw. Makakatanggap ka ng email kapag tapos na.`,
        )}
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          {say("Credit pack", "Credit pack")}
        </legend>
        <div className="grid gap-2 md:grid-cols-3">
          {packs.map((p) => {
            const saves = Math.round((1 - perThousand(p) / base) * 100);
            return (
              <label
                key={p.code}
                className="flex cursor-pointer flex-col gap-1 rounded-xl border border-line bg-white px-4 py-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="pack"
                      value={p.code}
                      checked={p.code === code}
                      onChange={() => setCode(p.code)}
                      className="accent-[var(--color-brand-600)]"
                    />
                    <span className="font-semibold">
                      {creditsLabel(p.credits)}
                    </span>
                  </span>
                  <span className="font-extrabold tabular-nums">
                    {formatPeso(p.priceMinor)}
                  </span>
                </span>
                <span className="text-muted">{packBuys(p.credits, say)}</span>
                {saves > 0 ? (
                  <span className="text-xs font-bold text-good">
                    {say(
                      `${saves}% less per credit`,
                      `${saves}% mas mura kada credit`,
                    )}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-muted">
          {say(
            `Credits last ${pack.validMonths} months from the day we confirm your payment, and carry over from month to month.`,
            `Tatagal ang credits nang ${pack.validMonths} buwan mula sa araw na ma-confirm ang bayad mo, at dala-dala ito sa susunod na mga buwan.`,
          )}
        </p>
      </fieldset>
      <GcashSteps total={pack.priceMinor} gcash={gcash} kind="credits" />
    </form>
  );
}
