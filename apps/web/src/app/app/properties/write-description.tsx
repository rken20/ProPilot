"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { draftDescription } from "./describe-actions";

/**
 * "Write with AI" for the description box. Reads what's typed in the form
 * (including rough notes in the description) and replaces the box's text with
 * a draft the agent can edit. Nothing is saved until the form is saved.
 */
export function WriteDescriptionButton({ targetId }: { targetId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(button: HTMLButtonElement) {
    const form = button.closest("form");
    const box = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!form || !box) return;
    const fd = new FormData(form);
    const val = (k: string) => String(fd.get(k) ?? "");
    const financing = [
      fd.get("bankFinancing") ? "Bank financing" : "",
      fd.get("pagIbig") ? "Pag-IBIG" : "",
      fd.get("inHouse") ? "In-house financing" : "",
    ].filter(Boolean);
    setError(null);
    start(async () => {
      const res = await draftDescription({
        name: val("name"),
        type: val("type"),
        location: val("location"),
        price: val("price"),
        reservationFee: val("reservationFee"),
        financing,
        downpaymentPercent: val("downpaymentPercent"),
        financingNotes: val("financingNotes"),
        notes: box.value,
      });
      if (res.error) setError(res.error);
      else if (res.text) {
        box.value = res.text;
        box.focus();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={(e) => run(e.currentTarget)}
        disabled={pending}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-brand-700 hover:border-brand-600 disabled:opacity-60"
      >
        <Sparkles className="size-4" aria-hidden /> {pending ? "Writing…" : "Write with AI"}
      </button>
      <span className="text-xs text-muted" role="status">
        {error ?? "Uses only the details above and your notes in the box. Check it before saving."}
      </span>
    </div>
  );
}
