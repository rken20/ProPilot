"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal, Sparkles, X } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import type { AgentTurn } from "@/lib/agent-assistant";
import { askAgentAssistant } from "./assistant-actions";

const SUGGESTIONS = [
  "Which leads haven't been contacted yet?",
  "How did we do in the last 7 days?",
  "Which chats are waiting for a reply?",
  "Draft a Facebook post for my newest listing",
];

/** "Ask ProPilot": a panel on every app page. It reads the team's data and drafts text; it never sends or changes anything. */
export function AgentAssistant() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...turns, { role: "user" as const, content: question }];
    setTurns(next);
    setText("");
    setBusy(true);
    setError(null);
    const r = await askAgentAssistant(next);
    setBusy(false);
    if (r.reply) setTurns([...next, { role: "assistant", content: r.reply }]);
    else {
      setError(r.error ?? "Something went wrong.");
      setTurns(turns);
      setText(question);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ask-propilot"
        className={cx(
          "fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-brand-900 px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-lift)] transition-[transform,background-color] duration-200 hover:bg-brand-700 active:scale-95",
          open && "max-sm:hidden",
        )}
      >
        <Sparkles className="size-4 text-[#c9a463]" aria-hidden />
        Ask ProPilot
      </button>

      {open ? (
        <section
          id="ask-propilot"
          aria-label="Ask ProPilot"
          className="pp-enter fixed inset-x-3 bottom-3 top-16 z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-lift)] sm:inset-x-auto sm:bottom-20 sm:right-5 sm:top-auto sm:h-[min(36rem,calc(100vh-7rem))] sm:w-[25rem]"
        >
          <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Ask ProPilot</h2>
              <p className="text-xs text-muted">Reads your leads, listings and chats. It drafts; you send.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted hover:bg-zinc-100 hover:text-ink" aria-label="Close">
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 ? (
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="block w-full rounded-xl border border-line px-3 py-2 text-left text-sm text-ink transition-colors hover:border-brand-600 hover:bg-brand-50 active:scale-[0.99]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            {turns.map((t, i) => (
              <div key={i} className={cx("pp-enter flex", t.role === "user" ? "justify-end" : "justify-start")}>
                <p
                  className={cx(
                    "max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    t.role === "user" ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-zinc-100 text-ink",
                  )}
                >
                  {t.content}
                </p>
              </div>
            ))}
            {busy ? (
              <p className="pp-fade pp-typing flex w-fit gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3.5" role="status">
                <span className="size-1.5 rounded-full bg-zinc-500" aria-hidden />
                <span className="size-1.5 rounded-full bg-zinc-500" aria-hidden />
                <span className="size-1.5 rounded-full bg-zinc-500" aria-hidden />
                <span className="sr-only">Looking that up</span>
              </p>
            ) : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
          >
            <div className="flex items-end gap-2 rounded-xl border border-zinc-300 p-1.5 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-100">
              <label htmlFor="ask-text" className="sr-only">
                Your question
              </label>
              <textarea
                id="ask-text"
                ref={inputRef}
                rows={1}
                maxLength={1500}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(text);
                  }
                }}
                placeholder="Ask about leads, listings or results"
                className="min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              />
              <button disabled={busy || !text.trim()} className={buttonClass("primary", "min-h-9 px-2.5")} aria-label="Ask">
                <SendHorizontal className="size-4" aria-hidden />
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
