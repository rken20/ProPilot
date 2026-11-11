"use client";

import { useEffect, useState } from "react";

const QUESTION = "How much is the reservation fee, and can I pay through Pag-IBIG?";
const ANSWER =
  "The reservation fee is ₱20,000. The agent lists Pag-IBIG financing as accepted. With 20% down, a 25-year loan at 6.25% comes to about ₱25,331 a month.";

/**
 * The home page's one moment: a buyer's question and the assistant's answer
 * play once when the page opens. Under reduced motion both show at once.
 */
export function HeroChat() {
  // 0 nothing yet, 1 question, 2 typing, 3 answer
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const plan: Array<[number, number]> = reduce
      ? [[0, 3]]
      : [
          [700, 1],
          [1300, 2],
          [2900, 3],
        ];
    const timers = plan.map(([delay, next]) => window.setTimeout(() => setStep(next), delay));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <div className="flex min-h-[170px] flex-col justify-end gap-3" aria-label="Example question from a buyer">
      {step >= 1 ? (
        <p className="pp-enter ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white">
          {QUESTION}
        </p>
      ) : null}
      {step === 2 ? (
        <p className="pp-fade pp-typing flex w-fit gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3.5" aria-label="Typing">
          <span className="size-1.5 rounded-full bg-zinc-500" />
          <span className="size-1.5 rounded-full bg-zinc-500" />
          <span className="size-1.5 rounded-full bg-zinc-500" />
        </p>
      ) : null}
      {step >= 3 ? (
        <p className="pp-enter max-w-[90%] rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-2.5 text-sm leading-relaxed text-ink">
          {ANSWER}
        </p>
      ) : null}
    </div>
  );
}
