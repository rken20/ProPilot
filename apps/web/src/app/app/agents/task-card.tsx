import Link from "next/link";
import { ArrowRight, Bot, Check, X } from "lucide-react";
import { Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { agentName } from "@/lib/agent-info";
import { isStage, STAGE_INFO } from "@/lib/pipeline";
import { timeAgo } from "@/lib/time";
import { applyStageTask, completeTask, dismissTask, sendTask } from "./actions";

export type TaskRow = {
  id: string;
  agent: string;
  kind: "reminder" | "message" | "stage";
  proposed_stage?: string | null;
  title: string;
  reason: string | null;
  draft: string | null;
  prospect_id: string | null;
  conversation_id: string | null;
  created_at: string;
};

/** One AI suggestion waiting for a decision. Nothing is sent until someone presses Send. */
export function TaskCard({ t, prospectName, canAct, showLead = true }: { t: TaskRow; prospectName?: string | null; canAct: boolean; showLead?: boolean }) {
  return (
    <li className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
          <Bot className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {agentName(t.agent)} · {timeAgo(t.created_at)}
          </p>
          <p className="mt-0.5 font-semibold">{t.title}</p>
          {t.reason ? <p className="mt-1 text-sm text-muted">{t.reason}</p> : null}
          {showLead && t.prospect_id ? (
            <Link href={`/app/pipeline/${t.prospect_id}`} className="mt-1.5 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
              Open {prospectName || "lead"}
            </Link>
          ) : null}

          {canAct ? (
            t.kind === "stage" && t.proposed_stage && isStage(t.proposed_stage) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={applyStageTask.bind(null, t.id)}>
                  <SubmitButton variant="secondary" pendingText="Moving…">
                    <ArrowRight className="size-4" aria-hidden /> Move to {STAGE_INFO[t.proposed_stage].label}
                  </SubmitButton>
                </form>
                <form action={dismissTask.bind(null, t.id)}>
                  <SubmitButton variant="ghost" pendingText="…">
                    <X className="size-4" aria-hidden /> Not yet
                  </SubmitButton>
                </form>
              </div>
            ) : t.kind === "message" ? (
              <form action={sendTask.bind(null, t.id)} className="mt-3 space-y-2">
                <label htmlFor={`draft-${t.id}`} className="text-xs font-medium text-muted">
                  Draft message (edit before sending)
                </label>
                <Textarea id={`draft-${t.id}`} name="text" defaultValue={t.draft ?? ""} maxLength={2000} className="mt-1 min-h-24" />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton pendingText="Sending…">Send</SubmitButton>
                  <button formAction={dismissTask.bind(null, t.id)} className={buttonClass("ghost")}>
                    <X className="size-4" aria-hidden /> Dismiss
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={completeTask.bind(null, t.id)}>
                  <SubmitButton variant="secondary" pendingText="Saving…">
                    <Check className="size-4" aria-hidden /> Done
                  </SubmitButton>
                </form>
                <form action={dismissTask.bind(null, t.id)}>
                  <SubmitButton variant="ghost" pendingText="…">
                    <X className="size-4" aria-hidden /> Dismiss
                  </SubmitButton>
                </form>
              </div>
            )
          ) : null}
        </div>
      </div>
    </li>
  );
}
