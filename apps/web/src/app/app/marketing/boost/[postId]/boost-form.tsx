"use client";

import { useActionState, useState } from "react";
import { useSay } from "@/components/lang";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import { checkPlan, BOOST_LIMITS } from "@/lib/boost-rules";
import { formatPeso } from "@/lib/money";
import { startBoost, type BoostState } from "../actions";

/** The owner's approval: the amount a day, the days, and a tick that approves the total. */
export function BoostForm({
  postId,
  dailyMinor,
  days: suggestedDays,
  accountName,
  area,
  action = startBoost.bind(null, postId),
}: {
  postId: string;
  dailyMinor: number;
  days: number;
  accountName: string;
  area: string;
  action?: (prev: BoostState, form: FormData) => Promise<BoostState>;
}) {
  const say = useSay();
  const [state, formAction] = useActionState<BoostState, FormData>(action, {});
  const [daily, setDaily] = useState(String(dailyMinor / 100));
  const [days, setDays] = useState(String(suggestedDays));
  const check = checkPlan(daily, days);

  if (state.started) {
    return (
      <Alert tone="success">
        {say(
          "Your boost is on. Facebook reviews new ads first, usually within a day, and then starts showing it. Results appear here as they come in.",
          "Naka-on na ang boost mo. Nire-review muna ng Facebook ang bagong ads, kadalasan sa loob ng isang araw, bago ito ipakita. Lalabas dito ang resulta habang dumarating.",
        )}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={say("Amount a day (₱)", "Halaga kada araw (₱)")} htmlFor="daily" hint={say("₱100 to ₱1,000 a day", "₱100 hanggang ₱1,000 kada araw")}>
          <Input id="daily" name="daily" inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value)} required />
        </Field>
        <Field label={say("Days", "Mga araw")} htmlFor="days" hint={say(`1 to ${BOOST_LIMITS.maxDays} days`, `1 hanggang ${BOOST_LIMITS.maxDays} araw`)}>
          <Input id="days" name="days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} required />
        </Field>
      </div>
      <dl className="grid gap-3 rounded-2xl bg-surface p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">{say("Total, at most", "Kabuuan, hanggang")}</dt>
          <dd className="text-xl font-extrabold tabular-nums">{check.ok ? formatPeso(check.totalMinor) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">{say("Shown to", "Ipapakita sa")}</dt>
          <dd className="font-semibold">{say(`Adults 18+, ${area.charAt(0).toLowerCase()}${area.slice(1)}`, `Edad 18 pataas, ${area}`)}</dd>
        </div>
        <div>
          <dt className="text-muted">{say("Paid from", "Babayaran mula sa")}</dt>
          <dd className="font-semibold">{accountName}</dd>
        </div>
      </dl>
      {!check.ok ? <p className="text-sm text-hot">{check.error}</p> : null}
      <label className="flex items-start gap-3 rounded-2xl border border-line p-4 text-sm">
        <input type="checkbox" name="approve" value="yes" required className="mt-0.5 size-4 accent-[var(--color-brand-600)]" />
        <span>
          {check.ok
            ? say(
                `I approve spending up to ${formatPeso(check.totalMinor)} from my ad account "${accountName}". Facebook charges it directly; MyHomeSeller never handles the money. I can stop the boost at any time.`,
                `Inaaprubahan ko ang paggastos nang hanggang ${formatPeso(check.totalMinor)} mula sa ad account kong "${accountName}". Direktang sisingilin ito ng Facebook; hindi kailanman hahawakan ng MyHomeSeller ang pera. Pwede kong itigil ang boost kahit kailan.`,
              )
            : say("I approve this spending.", "Inaaprubahan ko ang gastos na ito.")}
        </span>
      </label>
      <SubmitButton disabled={!check.ok} pendingText={say("Starting the boost…", "Sinisimulan ang boost…")}>
        {check.ok ? say(`Boost for ${formatPeso(check.totalMinor)}`, `I-boost sa halagang ${formatPeso(check.totalMinor)}`) : say("Boost", "I-boost")}
      </SubmitButton>
    </form>
  );
}
