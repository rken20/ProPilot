"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { centavosToPesosInput } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import { FINANCING, PROPERTY_TYPE_KEYS, TIMELINES, type Preferences } from "@/lib/qualification";
import { savePreferences, type PrefsState } from "./actions";

export function PreferencesForm({ p, share }: { p: Preferences | null; share: boolean }) {
  const [state, action] = useActionState<PrefsState, FormData>(savePreferences, {});
  return (
    <form action={action} className="space-y-6">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Saved. Agents you message will see this if sharing is on.</Alert> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Budget</legend>
        <Field label="From (₱)" htmlFor="budgetMin">
          <Input id="budgetMin" name="budgetMin" inputMode="decimal" defaultValue={centavosToPesosInput(p?.budget_min_minor)} placeholder="e.g. 3000000" />
        </Field>
        <Field label="Up to (₱)" htmlFor="budgetMax" hint="For renting, your monthly budget.">
          <Input id="budgetMax" name="budgetMax" inputMode="decimal" defaultValue={centavosToPesosInput(p?.budget_max_minor)} placeholder="e.g. 6000000" />
        </Field>
      </fieldset>

      <Field label="Areas" htmlFor="areas" hint="Up to 5, separated by commas.">
        <Input id="areas" name="areas" maxLength={300} defaultValue={p?.areas.join(", ") ?? ""} placeholder="e.g. Pasig, Ortigas, Cainta" />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Property type</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PROPERTY_TYPE_KEYS.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="types" value={t} defaultChecked={p?.property_types.includes(t)} className="accent-[var(--color-brand-600)]" />
              {TYPE_LABEL[t as keyof typeof TYPE_LABEL] ?? t}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bedrooms" htmlFor="bedrooms">
          <Select id="bedrooms" name="bedrooms" defaultValue={p?.bedrooms_min?.toString() ?? ""}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </Select>
        </Field>
        <Field label="When" htmlFor="timeline">
          <Select id="timeline" name="timeline" defaultValue={p?.timeline ?? ""}>
            <option value="">Not sure</option>
            {Object.entries(TIMELINES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paying with" htmlFor="financing">
          <Select id="financing" name="financing" defaultValue={p?.financing ?? ""}>
            <option value="">Not sure</option>
            {Object.entries(FINANCING)
              .filter(([k]) => k !== "unsure")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </Select>
        </Field>
      </div>

      <Field label="Must-haves (optional)" htmlFor="mustHaves">
        <Textarea id="mustHaves" name="mustHaves" maxLength={300} defaultValue={p?.must_haves ?? ""} className="min-h-20" placeholder="e.g. Pet-friendly, near an MRT station, parking for one car" />
      </Field>

      <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm">
        <input type="checkbox" name="share" defaultChecked={share} className="mt-0.5 size-4 accent-[var(--color-brand-600)]" />
        <span>
          <span className="font-medium">Share this with agents I contact</span>
          <span className="block text-muted">
            Only businesses you&apos;ve messaged or asked for a viewing can see it. Turn this off any time.
          </span>
        </span>
      </label>

      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}
