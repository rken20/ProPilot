"use client";

import { useActionState } from "react";
import { Alert, Field, Panel, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useLang, useSay } from "@/components/lang";
import type { FormState } from "@/lib/form";
import { setBusinessLanguage } from "./actions";

/** Taglish or English, for the whole business: the app, its public listing pages and the AI's chat replies. */
export function BusinessLanguage() {
  const lang = useLang();
  const say = useSay();
  const [state, action] = useActionState<FormState, FormData>(
    setBusinessLanguage,
    {},
  );
  return (
    <Panel icon3d="chat" title="Language" className="mb-6">
      <form action={action} className="mt-1 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Field
            label="Language"
            htmlFor="language"
            hint={say(
              "For the whole team: the app's screens, your public listing pages and the AI's chat replies to buyers.",
              "Para sa buong team: ang mga screen ng app, ang public listing pages mo at ang replies ng AI chat sa mga buyer.",
            )}
          >
            <Select
              id="language"
              name="language"
              defaultValue={lang}
              key={lang}
            >
              <option value="taglish">Taglish (English at Tagalog)</option>
              <option value="english">English only</option>
            </Select>
          </Field>
        </div>
        <SubmitButton
          variant="secondary"
          pendingText="Saving…"
          className="mb-6"
        >
          Save
        </SubmitButton>
      </form>
      {state.error ? (
        <Alert>{state.error}</Alert>
      ) : state.ok && state.message ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}
    </Panel>
  );
}
