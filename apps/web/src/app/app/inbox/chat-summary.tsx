"use client";

import { useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import type { Summary } from "@/lib/reply-helper";
import { summarizeConversation } from "./helper-actions";

/** "Summarize": a short catch-up on the chat and the next step, for the agent only. */
export function ChatSummary({ conversationId }: { conversationId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      setError(null);
      const r = await summarizeConversation(conversationId);
      if ("ok" in r) setSummary(r.ok);
      else setError(r.error);
    });

  if (summary) {
    return (
      <div className="pp-enter border-b border-line bg-brand-50/60 px-5 py-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 font-semibold text-brand-900">
            <Sparkles className="size-4" aria-hidden /> Catch-up{summary.language ? `, they write in ${summary.language}` : ""}
          </p>
          <button
            type="button"
            onClick={() => setSummary(null)}
            className="rounded p-1 text-muted hover:bg-white hover:text-ink"
            aria-label="Close summary"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
          {summary.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {summary.nextStep ? (
          <p className="mt-2 text-ink">
            <span className="font-semibold">Next step:</span> {summary.nextStep}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 border-b border-line px-5 py-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60"
      >
        <Sparkles className={pending ? "size-3.5 animate-pulse" : "size-3.5"} aria-hidden />
        {pending ? "Reading the chat…" : "Summarize this chat"}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
