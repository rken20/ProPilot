"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { Alert, Card, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { centavosToPesosInput, formatPeso } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import {
  FINANCING,
  MISSING_LABEL,
  PROPERTY_TYPE_KEYS,
  TEMPERATURE_LABEL,
  TIMELINES,
  type Facts,
  type MissingKey,
  type Preferences,
  type Temperature,
} from "@/lib/qualification";
import { timeAgo } from "@/lib/time";
import { letAiUpdateFacts, recheckProspect, saveQualification, type QualifyState } from "../actions";

export type QualificationData = Facts & {
  id: string;
  score: number | null;
  temperature: Temperature | null;
  score_reason: string | null;
  missing: MissingKey[];
  qualified_at: string | null;
  facts_by: "ai" | "team" | null;
};

const TONE: Record<Temperature, string> = {
  hot: "bg-[#f8ebe4] text-hot",
  warm: "bg-brass-50 text-[#7d5f26]",
  cold: "bg-zinc-100 text-zinc-600",
};

function budget(f: Pick<Facts, "budget_min_minor" | "budget_max_minor">): string | null {
  const { budget_min_minor: lo, budget_max_minor: hi } = f;
  if (lo === null && hi === null) return null;
  if (lo !== null && hi !== null) return lo === hi ? formatPeso(hi) : `${formatPeso(lo)} to ${formatPeso(hi)}`;
  return hi !== null ? `Up to ${formatPeso(hi)}` : `From ${formatPeso(lo)}`;
}

function FactRows({ f, extra }: { f: Facts; extra?: Array<[string, string | null]> }) {
  const rows: Array<[string, string | null]> = [
    ["Budget", budget(f)],
    ["Areas", f.areas.join(", ") || null],
    ["Type", f.property_types.map((t) => TYPE_LABEL[t as keyof typeof TYPE_LABEL] ?? t).join(", ") || null],
    ["Timing", f.timeline ? TIMELINES[f.timeline] : null],
    ["Paying with", f.financing ? FINANCING[f.financing] : null],
    ...(extra ?? []),
  ];
  return (
    <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className={cx(!v && "text-zinc-400")}>{v ?? "Unknown"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function QualificationCard({
  q,
  prefs,
  canEdit,
  aiOn,
}: {
  q: QualificationData;
  prefs: (Preferences & { updated_at: string }) | null;
  canEdit: boolean;
  aiOn: boolean;
}) {
  const [check, recheck] = useActionState<QualifyState, FormData>(() => recheckProspect(q.id), {});
  const [save, saveAction] = useActionState<QualifyState, FormData>(saveQualification.bind(null, q.id), {});
  const field =
    "mt-1 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Qualification</h2>
          <p className="mt-0.5 text-xs text-muted">
            {q.qualified_at ? `Checked by the lead qualifier ${timeAgo(q.qualified_at)}` : "Not checked yet"}
          </p>
        </div>
        {q.temperature ? (
          <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", TONE[q.temperature])}>
            {TEMPERATURE_LABEL[q.temperature]} · {q.score}
          </span>
        ) : null}
      </div>

      {q.score_reason ? <p className="text-sm">{q.score_reason}</p> : null}

      <FactRows f={q} />

      {q.missing.length ? (
        <p className="rounded-lg bg-surface px-3 py-2 text-sm">
          <span className="font-medium">Still to ask:</span> {q.missing.map((m) => MISSING_LABEL[m]).join(", ")}
        </p>
      ) : null}

      {prefs ? (
        <div className="rounded-xl border border-line p-3">
          <p className="mb-2 text-xs font-medium text-muted">What the buyer told ProPilot, {timeAgo(prefs.updated_at)}</p>
          <FactRows
            f={prefs}
            extra={[
              ["Bedrooms", prefs.bedrooms_min ? `${prefs.bedrooms_min}+` : null],
              ["Must-haves", prefs.must_haves],
            ]}
          />
        </div>
      ) : null}

      {canEdit ? (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {aiOn ? (
              <form action={recheck}>
                <SubmitButton variant="secondary" pendingText="Reading the lead…">
                  <RefreshCw className="size-4" aria-hidden /> Re-check with AI
                </SubmitButton>
              </form>
            ) : null}
            {q.facts_by === "team" ? (
              <form action={letAiUpdateFacts.bind(null, q.id)}>
                <SubmitButton variant="ghost" pendingText="…">
                  Let AI update the facts
                </SubmitButton>
              </form>
            ) : null}
          </div>
          {check.error ? <Alert>{check.error}</Alert> : null}
          {q.facts_by === "team" ? <p className="text-xs text-muted">Your team set these facts, so the AI only updates the score.</p> : null}

          <details className="rounded-xl border border-line px-3.5 py-2.5">
            <summary className="cursor-pointer text-sm font-medium">Correct the facts</summary>
            <form action={saveAction} className="mt-3 space-y-3 pb-1">
              {save.error ? <Alert>{save.error}</Alert> : null}
              {save.done ? <Alert tone="success">Saved. The AI will keep these.</Alert> : null}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-muted">
                  Budget from (₱)
                  <input name="budgetMin" inputMode="decimal" defaultValue={centavosToPesosInput(q.budget_min_minor)} className={field} />
                </label>
                <label className="text-xs font-medium text-muted">
                  Up to (₱)
                  <input name="budgetMax" inputMode="decimal" defaultValue={centavosToPesosInput(q.budget_max_minor)} className={field} />
                </label>
              </div>
              <label className="block text-xs font-medium text-muted">
                Areas (comma-separated)
                <input name="areas" defaultValue={q.areas.join(", ")} maxLength={300} placeholder="Pasig, Ortigas" className={field} />
              </label>
              <fieldset>
                <legend className="text-xs font-medium text-muted">Type</legend>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {PROPERTY_TYPE_KEYS.map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="types" value={t} defaultChecked={q.property_types.includes(t)} className="accent-[var(--color-brand-600)]" />
                      {TYPE_LABEL[t as keyof typeof TYPE_LABEL] ?? t}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-muted">
                  Timing
                  <select name="timeline" defaultValue={q.timeline ?? ""} className={field}>
                    <option value="">Unknown</option>
                    {Object.entries(TIMELINES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-muted">
                  Paying with
                  <select name="financing" defaultValue={q.financing ?? ""} className={field}>
                    <option value="">Unknown</option>
                    {Object.entries(FINANCING).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <SubmitButton variant="secondary" pendingText="Saving…">
                Save facts
              </SubmitButton>
            </form>
          </details>
        </div>
      ) : null}
    </Card>
  );
}
