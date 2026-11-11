"use client";

import { useActionState } from "react";
import { Globe } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { searchOnline, type OnlineState } from "./online-actions";

/** The button that searches other property sites, with a calm waiting state. */
export function OnlineSearch({ q, type, max, sources }: { q: string; type: string; max: string; sources: string }) {
  const [state, action, pending] = useActionState<OnlineState, FormData>(searchOnline, {});

  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="q" value={q} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="max" value={max} />
        <button disabled={pending} className={buttonClass("secondary", "min-h-11")}>
          <Globe className="size-4" aria-hidden />
          {pending ? "Searching other sites…" : "Search other property sites"}
        </button>
        <span className="text-sm text-muted">{sources}</span>
      </form>

      {pending ? (
        <div className="mt-5" role="status">
          <p className="pp-fade text-sm text-muted">Checking listing sites for “{q}”. This usually takes 20 to 40 seconds.</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="pp-skeleton aspect-[16/7] rounded-none" />
                <div className="space-y-2.5 p-4">
                  <div className="pp-skeleton h-6 w-32" />
                  <div className="pp-skeleton h-4 w-4/5" />
                  <div className="pp-skeleton h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : state.error ? (
        <p role="alert" className="pp-fade mt-4 text-sm text-red-700">
          {state.error}
        </p>
      ) : state.found === 0 ? (
        <p className="pp-fade mt-4 text-sm text-muted">No matching listings on other sites right now. Try a nearby area or a higher budget.</p>
      ) : null}
    </div>
  );
}
