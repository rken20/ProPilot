"use client";

import { useSay } from "@/components/lang";
import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { GRANT_MONTHS, MAX_GRANT_EMAILS, grantLine } from "@/lib/plan-grants";
import type { grantByEmail, GrantByEmailState } from "./actions";

/** Super admins: give a plan to beta testers by the email they sign in with. */
export function GrantByEmail({
  plans,
  give,
}: {
  plans: Array<{ code: string; name: string }>;
  give: typeof grantByEmail;
}) {
  const say = useSay();
  const [state, action] = useActionState<GrantByEmailState, FormData>(give, {});
  return (
    <>
      <form action={action} className="space-y-4">
        <Field
          label="Emails"
          htmlFor="grant-emails"
          hint={say(
            `The email each tester signs in with. One per line or separated by commas, up to ${MAX_GRANT_EMAILS} at a time.`,
            `Ang email na gamit ng bawat tester sa pag-sign in. Isa kada linya o pinaghihiwalay ng comma, hanggang ${MAX_GRANT_EMAILS} sa isang pagkakataon.`,
          )}
        >
          <Textarea
            id="grant-emails"
            name="emails"
            rows={3}
            required
            placeholder={"ana@example.com\nben@example.com"}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="Plan" htmlFor="grant-plan">
              <Select
                id="grant-plan"
                name="plan"
                defaultValue={
                  plans.find((p) => p.code === "pro")?.code ?? plans[0]?.code
                }
              >
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-32">
            <Field label="Months" htmlFor="grant-months">
              <Select id="grant-months" name="months" defaultValue="3">
                {GRANT_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-56 flex-1">
            <Field label="Note (optional)" htmlFor="grant-note">
              <Input
                id="grant-note"
                name="note"
                maxLength={200}
                placeholder="e.g. Beta tester, Iloilo brokers group"
              />
            </Field>
          </div>
          <SubmitButton pendingText="Giving…">Give plan</SubmitButton>
        </div>
      </form>

      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.results?.length ? (
        <div
          className="mt-2 rounded-2xl border border-line bg-grape-50/60 p-4"
          role="status"
        >
          <ul className="space-y-2 text-sm">
            {state.results.map((r) => (
              <li key={r.email}>
                <span className="font-semibold break-all">{r.email}</span>
                <span
                  className={
                    r.status === "failed"
                      ? "block text-hot"
                      : "block text-muted"
                  }
                >
                  {grantLine(r, state.plan ?? "The plan", say)}
                </span>
              </li>
            ))}
          </ul>
          {state.skipped?.length ? (
            <p className="mt-3 text-sm text-hot">
              Skipped, not an email address: {state.skipped.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
