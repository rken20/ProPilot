"use client";

import { useActionState, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Alert, buttonClass } from "@/components/ui";
import { sendAgentMessage, type SendState } from "./actions";

/** Reply box. Sending a message takes the conversation over from the AI. */
export function Composer({ conversationId, open, aiOn }: { conversationId: string; open: boolean; aiOn: boolean }) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendAgentMessage.bind(null, conversationId), {});
  const [text, setText] = useState("");
  // Clear the box once per successful send (adjusting state during render, not in an effect).
  const [clearedFor, setClearedFor] = useState<number | undefined>();
  if (state.sent && state.sent !== clearedFor) {
    setClearedFor(state.sent);
    setText("");
  }

  if (!open) {
    return (
      <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-muted">
        It&apos;s been more than 24 hours since their last message, so Messenger won&apos;t accept a reply from the Page. Call or text them
        instead, or wait for them to message again.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-2">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 transition-[border-color,box-shadow] focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-100">
        <label htmlFor="reply" className="sr-only">
          Your reply
        </label>
        <textarea
          id="reply"
          name="text"
          rows={2}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={aiOn ? "Write a reply. Sending it takes over from the AI." : "Write a reply"}
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <button disabled={pending || !text.trim()} className={buttonClass("primary", "min-h-10 px-3")} aria-label="Send">
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </div>
      <p className="px-1 text-xs text-muted">Enter to send, Shift+Enter for a new line. Sent from your Page on Messenger.</p>
    </form>
  );
}
