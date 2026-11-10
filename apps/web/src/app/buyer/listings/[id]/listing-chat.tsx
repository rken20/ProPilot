"use client";

import { useRef, useState } from "react";
import { SendHorizontal, Sparkles } from "lucide-react";
import { cx } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How much is the reservation fee?",
  "Can I use Pag-IBIG financing?",
  "Monthly payment at 6.5% for 20 years?",
];

export function ListingChat({ propertyId }: { propertyId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listing-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, messages: next }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error || "Something went wrong. Please try again.");
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setMessages(messages);
      setInput(q);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-white" aria-label="Ask about this property">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold">Ask about this property</h2>
          <p className="text-xs text-muted">Answers come only from the agent&apos;s listing details.</p>
        </div>
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-line px-3 py-1.5 text-left text-sm text-ink hover:border-brand-600 hover:bg-brand-50/50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <p
                className={cx(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "user" ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-surface text-ink",
                )}
              >
                {m.content}
              </p>
            </div>
          ))
        )}
        {busy ? <p className="text-sm text-muted">Checking the listing…</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={600}
          placeholder="Ask about price, financing, availability…"
          className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          disabled={busy || !input.trim()}
          className="grid size-9 place-items-center rounded-lg bg-brand-600 text-white disabled:opacity-40"
          aria-label="Send"
        >
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </form>
    </section>
  );
}
