"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/form";
import { createBusiness } from "./actions";

const TYPES = [
  ["independent_agent", "Independent agent or broker"],
  ["brokerage", "Brokerage / realty team"],
  ["developer", "Property developer"],
  ["property_management", "Property management"],
  ["other", "Other"],
] as const;

export function CreateBusinessForm() {
  const [state, action] = useActionState(createBusiness, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Business name" htmlFor="name" error={state.fieldErrors?.name} hint="What buyers know you as">
        <Input id="name" name="name" defaultValue={state.data?.name} placeholder="e.g. Cruz Realty Iloilo" required />
      </Field>
      <Field label="Type of business" htmlFor="type" error={state.fieldErrors?.type}>
        <Select id="type" name="type" defaultValue={state.data?.type ?? "independent_agent"}>
          {TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton className="w-full" pendingText="Setting up…">
        Continue
      </SubmitButton>
    </form>
  );
}
