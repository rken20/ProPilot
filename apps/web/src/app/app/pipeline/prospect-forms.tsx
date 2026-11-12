"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { KIND_LABEL, KINDS, OPEN_STAGES, STAGE_INFO, STAGES, type Stage } from "@/lib/pipeline";
import { createProspect, updateProspect, type ProspectFormState } from "./actions";

type Listing = { id: string; name: string };

function ListingSelect({ listings, value }: { listings: Listing[]; value?: string | null }) {
  return (
    <Select id="propertyId" name="propertyId" defaultValue={value ?? ""}>
      <option value="">None yet</option>
      {listings.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </Select>
  );
}

export function NewProspectForm({ listings }: { listings: Listing[] }) {
  const [state, action] = useActionState<ProspectFormState, FormData>(createProspect, {});
  return (
    <form action={action} className="space-y-5">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="They are a" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue="buyer">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" maxLength={40} placeholder="0917 123 4567" autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="email" hint="A phone number or an email is enough.">
          <Input id="email" name="email" type="email" maxLength={200} autoComplete="off" />
        </Field>
        <Field label="Interested in" htmlFor="propertyId">
          <ListingSelect listings={listings} />
        </Field>
        <Field label="Stage" htmlFor="stage">
          <Select id="stage" name="stage" defaultValue="inquiry">
            {OPEN_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_INFO[s].label}: {STAGE_INFO[s].help.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="note" hint="Only your team sees notes.">
        <Textarea id="note" name="note" maxLength={1000} placeholder="e.g. Referred by Mrs. Cruz. Looking for a 2BR near Ortigas, moving in March." />
      </Field>
      <p className="text-xs text-muted">Only add people who gave you their details or asked to be contacted.</p>
      <SubmitButton pendingText="Adding…">Add lead</SubmitButton>
    </form>
  );
}

export type ProspectDetails = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  kind: string;
  stage: Stage;
  property_id: string | null;
  lost_reason: string | null;
  dealValue: string;
  next_step: string | null;
  nextStepAt: string;
};

export function ProspectDetailsForm({ p, listings }: { p: ProspectDetails; listings: Listing[] }) {
  const [state, action] = useActionState<ProspectFormState, FormData>(updateProspect.bind(null, p.id), {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Saved.</Alert> : null}
      <Field label="Stage" htmlFor="stage">
        <Select id="stage" name="stage" defaultValue={p.stage}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_INFO[s].label}: {STAGE_INFO[s].help.toLowerCase()}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="If lost, why?" htmlFor="lostReason">
        <Input id="lostReason" name="lostReason" maxLength={200} defaultValue={p.lost_reason ?? ""} placeholder="e.g. Bought elsewhere, budget too low" />
      </Field>
      <Field label="Deal value (₱)" htmlFor="dealValue">
        <Input id="dealValue" name="dealValue" inputMode="decimal" defaultValue={p.dealValue} placeholder="e.g. 4500000" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <Field label="Next step" htmlFor="nextStep">
          <Input id="nextStep" name="nextStep" maxLength={200} defaultValue={p.next_step ?? ""} placeholder="e.g. Send reservation form" />
        </Field>
        <Field label="Due (PH time)" htmlFor="nextStepAt">
          <Input id="nextStepAt" name="nextStepAt" type="datetime-local" defaultValue={p.nextStepAt} />
        </Field>
      </div>
      <details className="group rounded-xl border border-line px-3.5 py-2.5">
        <summary className="cursor-pointer text-sm font-medium">Contact details and listing</summary>
        <div className="mt-3 space-y-4 pb-1">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required maxLength={120} defaultValue={p.name ?? ""} />
          </Field>
          <Field label="They are a" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue={p.kind}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" maxLength={40} defaultValue={p.phone ?? ""} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" maxLength={200} defaultValue={p.email ?? ""} />
          </Field>
          <Field label="Interested in" htmlFor="propertyId">
            <ListingSelect listings={listings} value={p.property_id} />
          </Field>
        </div>
      </details>
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}
