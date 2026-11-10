"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/form";

export function ViewingForm({
  action,
  defaults,
  minDate,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  defaults: { buyerName: string; buyerPhone: string };
  minDate: string;
}) {
  const [state, formAction] = useActionState(action, { data: defaults });
  if (state.ok) {
    return (
      <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <CircleCheck className="size-4" aria-hidden /> Request sent
        </p>
        <p className="mt-1">{state.message} Track it under My viewings.</p>
      </div>
    );
  }
  const v: Record<string, string | undefined> = state.data ?? defaults;
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Your name" htmlFor="buyerName" error={e.buyerName}>
        <Input id="buyerName" name="buyerName" autoComplete="name" defaultValue={v.buyerName} required />
      </Field>
      <Field label="Mobile number" htmlFor="buyerPhone" error={e.buyerPhone} hint="The agent will call or text to confirm">
        <Input id="buyerPhone" name="buyerPhone" type="tel" autoComplete="tel" defaultValue={v.buyerPhone} placeholder="0917 123 4567" required />
      </Field>
      <Field label="Preferred date" htmlFor="preferredDate" error={e.preferredDate} hint="Optional">
        <Input id="preferredDate" name="preferredDate" type="date" min={minDate} defaultValue={v.preferredDate} />
      </Field>
      <Field label="Budget or financing plan" htmlFor="budgetNote" error={e.budgetNote} hint="Optional, e.g. Pag-IBIG, around ₱5M">
        <Input id="budgetNote" name="budgetNote" defaultValue={v.budgetNote} maxLength={200} />
      </Field>
      <Field label="Message to the agent" htmlFor="message" error={e.message} hint="Optional">
        <Textarea id="message" name="message" defaultValue={v.message} rows={3} maxLength={1000} />
      </Field>
      <SubmitButton className="w-full" pendingText="Sending…">
        Request a viewing
      </SubmitButton>
    </form>
  );
}
