"use client";

import { useActionState } from "react";
import { Play } from "lucide-react";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { runAgentsNow, saveAgentSettings, type RunState, type SettingsState } from "./actions";

export function RunNow() {
  const [state, action] = useActionState<RunState, FormData>(runAgentsNow, {});
  return (
    <form action={action} className="space-y-3">
      <SubmitButton variant="secondary" pendingText="Checking your pipeline…">
        <Play className="size-4" aria-hidden /> Run now
      </SubmitButton>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.summary ? <Alert tone="success">{state.summary}</Alert> : null}
    </form>
  );
}

export function AgentSettingsForm({ enabled, followUpDays }: { enabled: boolean; followUpDays: number }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveAgentSettings, {});
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-0.5 size-4 accent-[var(--color-brand-600)]" />
        <span>
          <span className="font-medium">Run every morning</span>
          <span className="block text-muted">Around 6 AM Philippine time. Turn off to pause all agents.</span>
        </span>
      </label>
      <div>
        <label htmlFor="followUpDays" className="text-sm font-medium">
          A lead is quiet after
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="followUpDays"
            name="followUpDays"
            type="number"
            min={1}
            max={30}
            defaultValue={followUpDays}
            className="w-20 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
          />
          <span className="text-sm text-muted">days with no messages or updates</span>
        </div>
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Saved.</Alert> : null}
      <SubmitButton variant="secondary" pendingText="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
