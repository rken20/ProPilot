"use client";

import { useLang, useSay } from "@/components/lang";
import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { CONSENT_TEXT, WANT_TYPES } from "@/lib/match-alert-rules";
import { FINANCING, TIMELINES } from "@/lib/qualification";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/form";

export function ViewingForm({
  action,
  minDate,
  agent,
  matchEmails = false,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  minDate: string;
  agent: string;
  /** Whether buyers can ask for match emails (email has to be set up). */
  matchEmails?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const say = useSay();
  const lang = useLang();
  if (state.ok) {
    return (
      <div className="rounded-2xl bg-tile-mint p-5 text-sm" role="status">
        <p className="flex items-center gap-2 text-base font-bold text-brand-700">
          <CircleCheck className="size-5" aria-hidden /> Inquiry sent to {agent}
        </p>
        <p className="mt-1 text-ink/80">{state.message}</p>
      </div>
    );
  }
  const v: Record<string, string | undefined> = state.data ?? {};
  const e = state.fieldErrors ?? {};
  const wantTypes = (v.wantType ?? "").split(",");
  const wantsOpen = Boolean(v.wantType || v.wantBudget || v.wantAreas || v.wantTimeline || v.wantFinancing || v.alertConsent || e.wantBudget || e.wantAreas || e.alertConsent);
  return (
    <form action={formAction} className="relative space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Your name" htmlFor="buyerName" error={e.buyerName}>
        <Input id="buyerName" name="buyerName" autoComplete="name" defaultValue={v.buyerName} required />
      </Field>
      <Field label="Mobile number" htmlFor="buyerPhone" error={e.buyerPhone} hint={say("The agent will call or text to confirm", "Tatawag o magte-text ang agent para mag-confirm")}>
        <Input id="buyerPhone" name="buyerPhone" type="tel" autoComplete="tel" defaultValue={v.buyerPhone} placeholder="0917 123 4567" required />
      </Field>
      <Field label="Email" htmlFor="buyerEmail" error={e.buyerEmail} hint="Optional">
        <Input id="buyerEmail" name="buyerEmail" type="email" autoComplete="email" defaultValue={v.buyerEmail} />
      </Field>
      <Field label="Preferred viewing date" htmlFor="preferredDate" error={e.preferredDate} hint="Optional">
        <Input id="preferredDate" name="preferredDate" type="date" min={minDate} defaultValue={v.preferredDate} />
      </Field>
      <Field label="Budget or financing plan" htmlFor="budgetNote" error={e.budgetNote} hint={say("Optional, e.g. Pag-IBIG, around ₱5M", "Optional, hal. Pag-IBIG, mga ₱5M")}>
        <Input id="budgetNote" name="budgetNote" defaultValue={v.budgetNote} maxLength={200} />
      </Field>
      <Field label="Your question or message" htmlFor="message" error={e.message} hint="Optional">
        <Textarea id="message" name="message" defaultValue={v.message} rows={3} maxLength={1000} placeholder={say("Is it still available? Can I see it this weekend?", "Available pa po ba? Pwede ko bang makita this weekend?")} />
      </Field>
      <details className="group rounded-2xl border border-line bg-surface" open={wantsOpen}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-grape-700 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">+ </span>
          <span className="hidden group-open:inline">− </span>
          {say("Tell us what you're looking for", "Sabihin kung ano ang hanap mo")} <span className="font-medium text-muted">(optional)</span>
        </summary>
        <div className="space-y-3 border-t border-line px-4 py-4">
          <p className="text-xs text-muted">{say(`This helps ${agent} suggest the right property.`, `Makakatulong ito para ma-suggest ng ${agent} ang tamang property.`)}</p>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Property type</legend>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
              {(Object.keys(WANT_TYPES) as Array<keyof typeof WANT_TYPES>).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="wantType" value={t} defaultChecked={wantTypes.includes(t)} className="size-4 accent-[var(--color-grape-700)]" />
                  {WANT_TYPES[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Budget, up to (₱)" htmlFor="wantBudget" error={e.wantBudget}>
            <Input id="wantBudget" name="wantBudget" inputMode="decimal" defaultValue={v.wantBudget} placeholder="5000000" />
          </Field>
          <Field label="Preferred areas" htmlFor="wantAreas" error={e.wantAreas} hint={say("Up to 5, separated by commas", "Hanggang 5, pinaghihiwalay ng comma")}>
            <Input id="wantAreas" name="wantAreas" defaultValue={v.wantAreas} maxLength={300} placeholder="Pavia, Santa Barbara" />
          </Field>
          <Field label="When do you plan to buy?" htmlFor="wantTimeline">
            <Select id="wantTimeline" name="wantTimeline" defaultValue={v.wantTimeline ?? ""}>
              <option value="">Prefer not to say</option>
              {Object.entries(TIMELINES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How do you plan to pay?" htmlFor="wantFinancing">
            <Select id="wantFinancing" name="wantFinancing" defaultValue={v.wantFinancing ?? ""}>
              <option value="">Prefer not to say</option>
              {Object.entries(FINANCING).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {matchEmails ? (
            <div>
              <label className="flex items-start gap-2.5 rounded-xl bg-white p-3 text-sm leading-snug">
                <input type="checkbox" name="alertConsent" defaultChecked={v.alertConsent === "on"} className="mt-0.5 size-4 shrink-0 accent-[var(--color-grape-700)]" />
                <span>
                  {CONSENT_TEXT}{" "}
                  <Link href="/privacy" target="_blank" className="font-semibold text-grape-700 hover:underline">
                    Privacy policy
                  </Link>
                </span>
              </label>
              {e.alertConsent ? <p className="pp-fade mt-1.5 text-sm text-red-700">{e.alertConsent}</p> : null}
            </div>
          ) : null}
        </div>
      </details>
      {/* So the answer comes back in the page's language. */}
      <input type="hidden" name="lang" value={lang} />
      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton className="w-full" pendingText="Sending…">
        Send inquiry
      </SubmitButton>
      <p className="text-center text-xs text-muted">
        {say(`Your inquiry goes only to ${agent}. No account needed.`, `Kay ${agent} lang mapupunta ang inquiry mo. Hindi kailangan ng account.`)}{" "}
        <Link href="/privacy" target="_blank" className="underline">
          Privacy policy
        </Link>
      </p>
    </form>
  );
}
