"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Copy, MessageSquareText, Phone, Sparkles } from "lucide-react";
import { useSay } from "@/components/lang";
import { Alert, Badge, Textarea, buttonClass, cx } from "@/components/ui";
import type { DraftResult } from "./actions";

export type FollowUpItem = {
  id: string;
  name: string;
  stage: string;
  temperature: string | null;
  why: "next-step" | "quiet";
  days: number;
  nextStep: string | null;
  listing: string | null;
  phone: string | null;
  /** Their chat in Messages, if they have one. */
  chatHref: string | null;
};

type Actions = {
  write: (id: string) => Promise<DraftResult>;
  done: (id: string, text: string) => Promise<{ ok: true } | { error: string }>;
};

export function FollowUpList({
  items,
  aiOn,
  actions,
}: {
  items: FollowUpItem[];
  aiOn: boolean;
  actions: Actions;
}) {
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <Row key={item.id} item={item} aiOn={aiOn} actions={actions} />
      ))}
    </ul>
  );
}

const HEAT: Record<string, string> = {
  hot: "bg-hot-50 text-hot",
  warm: "bg-tile-lemon text-brass-700",
  cold: "bg-tile-sky text-grape-700",
};

function Row({
  item,
  aiOn,
  actions,
}: {
  item: FollowUpItem;
  aiOn: boolean;
  actions: Actions;
}) {
  const say = useSay();
  const [text, setText] = useState<string | null>(null);
  const [byAi, setByAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, start] = useTransition();

  const write = () =>
    start(async () => {
      setError(null);
      const r = await actions.write(item.id);
      if ("error" in r) return setError(r.error);
      setText(r.text);
      setByAi(r.byAi);
    });
  const done = () =>
    start(async () => {
      setError(null);
      const r = await actions.done(item.id, text ?? "");
      if ("error" in r) return setError(r.error);
      setFinished(true);
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        say(
          "Couldn't copy. Select the text and copy it yourself.",
          "Hindi ma-copy. I-select ang text at i-copy mo na lang.",
        ),
      );
    }
  };

  if (finished)
    return (
      <li className="flex items-center gap-2 rounded-[1.5rem] border border-line bg-tile-mint px-5 py-4 text-sm font-semibold">
        <Check className="size-4 text-brand-700" aria-hidden />{" "}
        {say(
          `Followed up with ${item.name}. It's on their timeline.`,
          `Na-follow up na si ${item.name}. Nasa timeline na niya.`,
        )}
      </li>
    );

  const phone = item.phone?.replace(/[^+\d]/g, "") ?? "";
  return (
    <li className="rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/pipeline/${item.id}`}
              className="text-base font-bold hover:underline"
            >
              {item.name}
            </Link>
            <Badge>{item.stage}</Badge>
            {item.temperature ? (
              <span
                className={cx(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                  HEAT[item.temperature],
                )}
              >
                {item.temperature}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-muted">
            {item.why === "next-step"
              ? say(
                  `Next step is due: ${item.nextStep ?? "follow up"}`,
                  `Due na ang next step: ${item.nextStep ?? "follow up"}`,
                )
              : item.days === 1
                ? say(
                    "No messages or updates for a day",
                    "Walang message o update nang isang araw",
                  )
                : say(
                    `No messages or updates for ${item.days} days`,
                    `Walang message o update nang ${item.days} araw`,
                  )}
            {item.listing ? ` · ${item.listing}` : ""}
          </p>
        </div>
        {text === null ? (
          <button
            type="button"
            onClick={write}
            disabled={busy}
            className={buttonClass("primary", "min-h-11")}
          >
            <Sparkles className="size-4" aria-hidden />{" "}
            {busy ? say("Writing…", "Sinusulat…") : "Write a Follow-up"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {text !== null ? (
        <div className="mt-4">
          <label htmlFor={`fu-${item.id}`} className="text-sm font-medium">
            {byAi
              ? say(
                  "Draft by the AI. Read it, change what you like, then send it yourself.",
                  "Draft ng AI. Basahin, baguhin ang gusto mo, tapos ikaw ang mag-send.",
                )
              : say(
                  "A starting message. Change what you like, then send it yourself.",
                  "Panimulang message. Baguhin ang gusto mo, tapos ikaw ang mag-send.",
                )}
          </label>
          <Textarea
            id={`fu-${item.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={1500}
            className="mt-1.5"
          />
          {!aiOn ? (
            <p className="mt-1 text-xs text-muted">
              {say(
                "On a plan with AI, the message is written from the lead's own chat and what they're looking for.",
                "Sa plan na may AI, sinusulat ang message mula sa sariling chat ng lead at sa hinahanap niya.",
              )}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className={buttonClass("secondary", "min-h-11")}
            >
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}{" "}
              {copied ? "Copied" : "Copy"}
            </button>
            {phone ? (
              <>
                <a
                  href={`sms:${phone}?&body=${encodeURIComponent(text)}`}
                  className={buttonClass("secondary", "min-h-11")}
                >
                  <MessageSquareText className="size-4" aria-hidden /> Text
                </a>
                <a
                  href={`tel:${phone}`}
                  className={buttonClass("secondary", "min-h-11")}
                >
                  <Phone className="size-4" aria-hidden /> Call
                </a>
              </>
            ) : null}
            {item.chatHref ? (
              <Link
                href={item.chatHref}
                className={buttonClass("secondary", "min-h-11")}
              >
                Open Chat
              </Link>
            ) : null}
            <button
              type="button"
              onClick={done}
              disabled={busy}
              className={buttonClass("primary", "ml-auto min-h-11")}
            >
              <Check className="size-4" aria-hidden /> Mark as Followed Up
            </button>
          </div>
          {item.chatHref ? (
            <p className="mt-2 text-xs text-muted">
              {say(
                "Messenger only lets a Page reply within 24 hours of the buyer's last message. After that, call or text.",
                "Sa Messenger, pwede lang mag-reply ang Page sa loob ng 24 oras mula sa huling message ng buyer. Pagkatapos noon, tawag o text na.",
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
