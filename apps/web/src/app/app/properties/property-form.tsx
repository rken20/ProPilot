"use client";

import { useActionState } from "react";
import { PROPERTY_STATUSES, PROPERTY_TYPES } from "@propilot/shared";
import { Alert, Field, Input, Label, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/form";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/property-labels";

export type PropertyFormValues = Record<string, string>;

export function PropertyForm({
  action,
  initial,
  submitLabel,
  readOnly = false,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: PropertyFormValues;
  submitLabel: string;
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState(action, { data: initial });
  const v = state.data ?? initial;
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <fieldset disabled={readOnly} className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Property name" htmlFor="name" error={e.name} hint="As buyers will see it, e.g. 2BR Unit 12A, Avida Towers">
              <Input id="name" name="name" defaultValue={v.name} required />
            </Field>
          </div>
          <Field label="Type" htmlFor="type" error={e.type}>
            <Select id="type" name="type" defaultValue={v.type || "condominium"}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status" error={e.status}>
            <Select id="status" name="status" defaultValue={v.status || "available"}>
              {PROPERTY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Location" htmlFor="location" error={e.location} hint="Barangay, city, landmark">
              <Input id="location" name="location" defaultValue={v.location} required />
            </Field>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Selling price (₱)" htmlFor="price" error={e.price}>
            <Input id="price" name="price" inputMode="decimal" defaultValue={v.price} placeholder="4,500,000" required />
          </Field>
          <Field label="Reservation fee (₱)" htmlFor="reservationFee" error={e.reservationFee} hint="Optional">
            <Input id="reservationFee" name="reservationFee" inputMode="decimal" defaultValue={v.reservationFee} placeholder="25,000" />
          </Field>
        </section>

        <section className="space-y-3">
          <p className="text-sm font-medium text-zinc-800">Financing options</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {[
              ["bankFinancing", "Bank financing"],
              ["pagIbig", "Pag-IBIG"],
              ["inHouse", "In-house financing"],
            ].map(([key, label]) => (
              <Label key={key} className="flex items-center gap-2 font-normal">
                <input type="checkbox" name={key} defaultChecked={v[key!] === "on"} className="size-4 accent-brand-600" />
                {label}
              </Label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Downpayment (%)" htmlFor="downpaymentPercent" error={e.downpaymentPercent} hint="Optional">
              <Input id="downpaymentPercent" name="downpaymentPercent" inputMode="decimal" defaultValue={v.downpaymentPercent} placeholder="20" />
            </Field>
            <Field label="Financing notes" htmlFor="financingNotes" hint="Terms the assistant may quote, e.g. up to 20 years">
              <Input id="financingNotes" name="financingNotes" defaultValue={v.financingNotes} />
            </Field>
          </div>
        </section>

        <Label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 font-normal">
          <input type="checkbox" name="isPublic" defaultChecked={v.isPublic === "on"} className="mt-0.5 size-4 accent-brand-600" />
          <span>
            <span className="block font-semibold text-ink">Show to ProPilot buyers</span>
            <span className="block text-sm text-muted">
              Buyers signed in to ProPilot can find this listing, ask the AI about it and request viewings. Sold and
              archived listings are always hidden.
            </span>
          </span>
        </Label>

        <Field label="Description" htmlFor="description" error={e.description} hint="Features, inclusions, nearby places. The assistant uses only what's written here.">
          <Textarea id="description" name="description" defaultValue={v.description} rows={5} />
        </Field>
      </fieldset>

      {readOnly ? null : <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>}
    </form>
  );
}
