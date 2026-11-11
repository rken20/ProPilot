"use client";

import { useActionState, useState, useTransition } from "react";
import { Languages, SendHorizontal, Sparkles } from "lucide-react";
import { Alert, buttonClass, cx } from "@/components/ui";
import { sendAgentMessage, type SendState } from "./actions";
import { draftConversationReply, translateText } from "./helper-actions";

/** Reply box. Sending a message takes the conversation over from the AI. */
export function Composer({
  conversationId,
  open,
  aiOn,
  channel,
  helper,
}: {
  conversationId: string;
  open: boolean;
  aiOn: boolean;
  channel: "messenger" | "app";
  helper: boolean;
}) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendAgentMessage.bind(null, conversationId), {});
  const [text, setText] = useState("");
  // Clear the box once per successful send (adjusting state during render, not in an effect).
  const [clearedFor, setClearedFor] = useState<number | undefined>();
  if (state.sent && state.sent !== clearedFor) {
    setClearedFor(state.sent);
    setText("");
  }
  // The reply helper writes into the box; nothing is sent until the agent presses Send.
  const [helping, startHelp] = useTransition();
  const [helpError, setHelpError] = useState<string | null>(null);
  const [helpLabel, setHelpLabel] = useState("");
  const help = (label: string, run: () => Promise<{ ok: string } | { error: string }>) =>
    startHelp(async () => {
      setHelpLabel(label);
      setHelpError(null);
      const r = await run();
      if ("ok" in r) setText(r.ok);
      else setHelpError(r.error);
    });

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
      {helper ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <HelperButton
            icon={Sparkles}
            busy={helping && helpLabel === "draft"}
            disabled={helping}
            onClick={() => help("draft", () => draftConversationReply(conversationId, text))}
            title={text.trim() ? "Turn your notes into a reply" : "Draft a reply from the chat"}
          >
            {text.trim() ? "Polish into a reply" : "Draft a reply"}
          </HelperButton>
          <HelperButton
            icon={Languages}
            busy={helping && helpLabel === "fil"}
            disabled={helping || !text.trim()}
            onClick={() => help("fil", () => translateText(conversationId, text, "fil"))}
          >
            To Filipino
          </HelperButton>
          <HelperButton
            icon={Languages}
            busy={helping && helpLabel === "en"}
            disabled={helping || !text.trim()}
            onClick={() => help("en", () => translateText(conversationId, text, "en"))}
          >
            To English
          </HelperButton>
          {helpError ? <span className="text-xs text-red-700">{helpError}</span> : null}
        </div>
      ) : null}
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
          className={cx(
            "min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none transition-opacity",
            helping && "opacity-50",
          )}
        />
        <button disabled={pending || helping || !text.trim()} className={buttonClass("primary", "min-h-10 px-3")} aria-label="Send">
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </div>
      <p className="px-1 text-xs text-muted">
        Enter to send, Shift+Enter for a new line.{" "}
        {channel === "app" ? "Sent to the buyer in ProPilot." : "Sent from your Page on Messenger."}
      </p>
    </form>
  );
}

function HelperButton({
  icon: Icon,
  busy,
  disabled,
  onClick,
  title,
  children,
}: {
  icon: typeof Sparkles;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-brand-600 hover:bg-brand-50 active:scale-[0.98] disabled:opacity-50"
    >
      <Icon className={cx("size-3.5 text-brand-600", busy && "animate-pulse")} aria-hidden />
      {busy ? "Working…" : children}
    </button>
  );
}
