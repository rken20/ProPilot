"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Alert, buttonClass, cx } from "@/components/ui";
import { MAX_CHAT_CHARS, type ChatMessage } from "@/lib/app-chat-shared";
import { loadChat, sendChat } from "../actions";

const SUGGESTIONS = ["Is this still available?", "Can I schedule a viewing this weekend?", "What payment options do you accept?"];

/** The buyer's side of an in-app chat. Polls for replies: quickly while waiting for the AI, slowly otherwise. */
export function BuyerChat({ conversationId, businessName, initial }: { conversationId: string; businessName: string; initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // True from sending until a reply arrives (or a minute passes): shows typing dots and polls faster.
  const [typing, setTyping] = useState(false);

  const refresh = useCallback(async () => {
    const next = await loadChat(conversationId);
    if (next.at(-1) && next.at(-1)!.sender !== "buyer") setTyping(false);
    setMessages((prev) => (next.length !== prev.length || next.at(-1)?.id !== prev.at(-1)?.id ? next : prev));
  }, [conversationId]);

  useEffect(() => {
    const id = window.setInterval(refresh, typing ? 2500 : 15000);
    return () => window.clearInterval(id);
  }, [refresh, typing]);

  useEffect(() => {
    if (!typing) return;
    const id = window.setTimeout(() => setTyping(false), 60_000);
    return () => window.clearTimeout(id);
  }, [typing]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  async function send(body: string) {
    const q = body.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const optimistic: ChatMessage = { id: `local-${crypto.randomUUID()}`, sender: "buyer", body: q, created_at: "" };
    setMessages((m) => [...m, optimistic]);
    setText("");
    const r = await sendChat(conversationId, q);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setText(q);
      return;
    }
    if (r.messages) setMessages(r.messages);
    setTyping(r.messages?.at(-1)?.sender === "buyer");
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]" aria-label={`Chat with ${businessName}`}>
      <ol className="max-h-[60vh] min-h-64 space-y-3 overflow-y-auto px-5 py-5" aria-live="polite">
        {messages.length === 0 ? (
          <li className="text-sm text-muted">
            Say hello or pick a question. {businessName}&apos;s AI assistant answers right away, and an agent can join anytime.
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line px-3 py-1.5 text-left text-sm text-ink transition-colors hover:border-brand-600 hover:bg-brand-50 active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>
          </li>
        ) : null}
        {messages.map((m) => {
          const mine = m.sender === "buyer";
          return (
            <li key={m.id} className={cx("pp-enter flex flex-col", mine ? "items-end" : "items-start")}>
              <p
                className={cx(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-zinc-100 text-ink",
                )}
              >
                {m.body}
              </p>
              {!mine ? (
                <span className="mt-1 px-1 text-[11px] text-muted">{m.sender === "ai" ? `${businessName}'s AI assistant` : `${businessName} agent`}</span>
              ) : null}
            </li>
          );
        })}
        {typing ? (
          <li className="pp-fade pp-typing flex w-fit gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3.5" role="status">
            <span className="size-1.5 rounded-full bg-zinc-500" aria-hidden />
            <span className="size-1.5 rounded-full bg-zinc-500" aria-hidden />
            <span className="size-1.5 rounded-full bg-zinc-500" aria-hidden />
            <span className="sr-only">Writing a reply</span>
          </li>
        ) : null}
        <div ref={endRef} />
      </ol>
      <form
        className="space-y-2 border-t border-line px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 transition-[border-color,box-shadow] focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-100">
          <label htmlFor="chat-text" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-text"
            rows={2}
            maxLength={MAX_CHAT_CHARS}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder="Write a message"
            className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <button disabled={busy || !text.trim()} className={buttonClass("primary", "min-h-10 px-3")} aria-label="Send">
            <SendHorizontal className="size-4" aria-hidden />
          </button>
        </div>
        <p className="px-1 text-xs text-muted">Messages go to {businessName}&apos;s team. Don&apos;t share passwords or bank details.</p>
      </form>
    </section>
  );
}
