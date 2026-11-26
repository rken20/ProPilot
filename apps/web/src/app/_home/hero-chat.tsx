"use client";

import type { Lang } from "@/lib/lang";
import { useEffect, useRef, useState } from "react";

// In Taglish the buyer and the assistant write the way the AI chat does by default.
const CHAT: Record<Lang, { question: string; answer: string }> = {
  english: {
    question: "How much is the reservation fee, and can I pay through Pag-IBIG?",
    answer: "The reservation fee is ₱20,000. The agent lists Pag-IBIG financing as accepted. With 20% down, a 25-year loan at 6.25% comes to about ₱25,331 a month.",
  },
  taglish: {
    question: "Magkano po ang reservation fee, at pwede po ba through Pag-IBIG?",
    answer: "₱20,000 po ang reservation fee. Tumatanggap po ang agent ng Pag-IBIG financing. Sa 20% down, mga ₱25,331 a month po ang 25-year loan sa 6.25%.",
  },
};

/**
 * A buyer's question and the assistant's answer play once, when the chat
 * scrolls into view. Under reduced motion both show at once.
 */
export function HeroChat({ lang }: { lang: Lang }) {
  const { question: QUESTION, answer: ANSWER } = CHAT[lang];
  // 0 nothing yet, 1 question, 2 typing, 3 answer
  const [step, setStep] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const plan: Array<[number, number]> = reduce
      ? [[0, 3]]
      : [
          [300, 1],
          [900, 2],
          [2500, 3],
        ];
    let timers: number[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        timers = plan.map(([delay, next]) => window.setTimeout(() => setStep(next), delay));
      },
      { threshold: 0.5 },
    );
    if (box.current) io.observe(box.current);
    return () => {
      io.disconnect();
      timers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    <div ref={box} className="flex min-h-[170px] flex-col justify-end gap-3" aria-label="Example question from a buyer">
      {step >= 1 ? (
        <p className="pp-enter ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#1565e6] px-4 py-2.5 text-sm leading-relaxed text-white">
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
