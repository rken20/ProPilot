"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/form";

export function ViewingForm({
  action,
  minDate,
  agent,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  minDate: string;
  agent: string;
}) {
  const [state, formAction] = useActionState(action, {});
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
  return (
    <form action={formAction} className="relative space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Your name" htmlFor="buyerName" error={e.buyerName}>
        <Input id="buyerName" name="buyerName" autoComplete="name" defaultValue={v.buyerName} required />
      </Field>
      <Field label="Mobile number" htmlFor="buyerPhone" error={e.buyerPhone} hint="The agent will call or text to confirm">
        <Input id="buyerPhone" name="buyerPhone" type="tel" autoComplete="tel" defaultValue={v.buyerPhone} placeholder="0917 123 4567" required />
      </Field>
      <Field label="Email" htmlFor="buyerEmail" error={e.buyerEmail} hint="Optional">
        <Input id="buyerEmail" name="buyerEmail" type="email" autoComplete="email" defaultValue={v.buyerEmail} />
      </Field>
      <Field label="Preferred viewing date" htmlFor="preferredDate" error={e.preferredDate} hint="Optional">
        <Input id="preferredDate" name="preferredDate" type="date" min={minDate} defaultValue={v.preferredDate} />
      </Field>
      <Field label="Budget or financing plan" htmlFor="budgetNote" error={e.budgetNote} hint="Optional, e.g. Pag-IBIG, around ₱5M">
        <Input id="budgetNote" name="budgetNote" defaultValue={v.budgetNote} maxLength={200} />
      </Field>
      <Field label="Your question or message" htmlFor="message" error={e.message} hint="Optional">
        <Textarea id="message" name="message" defaultValue={v.message} rows={3} maxLength={1000} placeholder="Is it still available? Can I see it this weekend?" />
      </Field>
      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton className="w-full" pendingText="Sending…">
        Send inquiry
      </SubmitButton>
      <p className="text-center text-xs text-muted">Your details go only to {agent}. No account needed.</p>
    </form>
  );
}
