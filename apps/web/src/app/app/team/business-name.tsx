"use client";

import { useSay } from "@/components/lang";
import { useActionState } from "react";
import { Alert, Field, Input, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/form";
import { renameBusiness } from "./actions";

/** The business's name, for owners and admins to change. */
export function BusinessName({ name }: { name: string }) {
  const [state, action] = useActionState<FormState, FormData>(renameBusiness, { data: { businessName: name } });
  const say = useSay();
  return (
    <Panel title="Business name" className="mb-6">
      <form action={action} className="mt-1 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Field
            label="Name"
            htmlFor="businessName"
            error={state.fieldErrors?.businessName}
            hint={say("Shown in the app and as the seller on every public listing page.", "Ito ang lalabas sa app at bilang seller sa bawat public listing page.")}
          >
            <Input id="businessName" name="businessName" defaultValue={state.data?.businessName ?? name} minLength={2} maxLength={120} required />
          </Field>
        </div>
        <SubmitButton variant="secondary" pendingText="Saving…" className="mb-6">
          Save
        </SubmitButton>
      </form>
      {state.error ? <Alert>{state.error}</Alert> : state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
    </Panel>
  );
}
