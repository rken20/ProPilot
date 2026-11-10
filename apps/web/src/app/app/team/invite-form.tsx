"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { initialFormState } from "@/lib/form";
import { inviteMember } from "./actions";

export function InviteForm({ roles }: { roles: Array<{ value: string; label: string }> }) {
  const [state, action] = useActionState(inviteMember, initialFormState);
  const [copied, setCopied] = useState(false);
  const link = state.ok ? state.data?.link : undefined;

  return (
    <div className="space-y-4">
      {link ? (
        <Alert tone="success">
          <p>{state.message}</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={link} className="mt-0 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs">Email delivery of invites comes later in the beta. For now, send the link yourself.</p>
        </Alert>
      ) : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end" onSubmit={() => setCopied(false)}>
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" defaultValue={link ? "" : state.data?.email} required />
        </Field>
        <Field label="Role" htmlFor="role" error={state.fieldErrors?.role}>
          <Select id="role" name="role" defaultValue={state.data?.role ?? "agent"}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pendingText="Creating…">Create invite</SubmitButton>
      </form>
    </div>
  );
}
