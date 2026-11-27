"use client";

import { useActionState } from "react";
import { CircleCheck, Flag } from "lucide-react";
import { useLang, useSay } from "@/components/lang";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/form";
import { REPORT_REASONS, REPORT_REASON_LABEL } from "@/lib/seller-trust";

/** "Report this listing" on a public page. The report goes to MyHomeSeller, never to the seller. */
export function ReportListing({
  action,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const say = useSay();
  const lang = useLang();
  const v = state.data ?? {};
  const e = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <p
        className="flex items-start gap-2 rounded-2xl bg-tile-mint p-4 text-sm text-ink"
        role="status"
      >
        <CircleCheck
          className="mt-0.5 size-4 shrink-0 text-brand-700"
          aria-hidden
        />
        {state.message}
      </p>
    );
  }
  return (
    <details
      className="group rounded-2xl border border-line bg-white"
      open={Boolean(state.error || state.fieldErrors) || undefined}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <Flag className="size-4 text-hot" aria-hidden /> Report this listing
      </summary>
      <form
        action={formAction}
        className="relative space-y-4 border-t border-line p-4"
      >
        <p className="text-sm text-muted">
          {say(
            "Tell MyHomeSeller if this listing looks fake or the seller asked for money before a viewing. The seller isn't told who reported.",
            "Sabihin sa MyHomeSeller kung mukhang fake ang listing na ito o humingi ng pera ang seller bago mag-viewing. Hindi sasabihin sa seller kung sino ang nag-report.",
          )}
        </p>
        {state.error ? <Alert>{state.error}</Alert> : null}
        <Field label="What's wrong?" htmlFor="report-reason" error={e.reason}>
          <Select
            id="report-reason"
            name="reason"
            defaultValue={v.reason ?? ""}
            required
          >
            <option value="" disabled>
              Choose one
            </option>
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {say(...REPORT_REASON_LABEL[r])}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="What happened?"
          htmlFor="report-details"
          error={e.details}
          hint={say(
            "A few words help us check faster.",
            "Makakatulong ang ilang salita para mabilis naming ma-check.",
          )}
        >
          <Textarea
            id="report-details"
            name="details"
            defaultValue={v.details}
            rows={3}
            maxLength={1000}
          />
        </Field>
        <Field
          label="Your mobile number or email"
          htmlFor="report-contact"
          error={e.contact}
          hint={say(
            "Optional. Only MyHomeSeller sees it, to ask you about this report, and it's erased once the report is closed.",
            "Optional. MyHomeSeller lang ang makakakita, para matanong ka tungkol sa report na ito, at buburahin ito kapag sarado na ang report.",
          )}
        >
          <Input
            id="report-contact"
            name="contact"
            defaultValue={v.contact}
            maxLength={120}
            autoComplete="off"
          />
        </Field>
        <input type="hidden" name="lang" value={lang} />
        {/* Hidden from people; bots fill it in. */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] size-px overflow-hidden"
        >
          <label htmlFor="report-website">Website</label>
          <input
            id="report-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <SubmitButton variant="secondary" pendingText="Sending…">
          Send report
        </SubmitButton>
      </form>
    </details>
  );
}
