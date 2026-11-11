"use client";

import { useActionState, useState } from "react";
import { ChevronDown, ClipboardPaste } from "lucide-react";
import { Alert, Card, Textarea, buttonClass, cx } from "@/components/ui";
import { MAX_POST_CHARS } from "@/lib/post-import";
import { createProperty } from "../actions";
import { importFromPost, type ImportState } from "../import-actions";
import { PropertyForm } from "../property-form";

/** Add property, with an optional "start from a Facebook post" step above the form. */
export function NewProperty({ canImport }: { canImport: boolean }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importFromPost, {});
  const filled = Boolean(state.nonce);
  // The paste box starts open and folds away after each fill; the button reopens it.
  const key = state.nonce ?? 0;
  const [openFor, setOpenFor] = useState<number | null>(0);
  // Controlled, so the pasted text survives React resetting the form after a submit.
  const [post, setPost] = useState("");
  const expanded = openFor === key;

  return (
    <>
      {canImport ? (
        <Card className="mb-6 p-0!">
          <button
            type="button"
            onClick={() => setOpenFor(expanded ? null : key)}
            aria-expanded={expanded}
            className="flex w-full items-center gap-4 p-5 text-left sm:p-6"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <ClipboardPaste className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Start from a Facebook post</span>
              <span className="block text-sm text-muted">
                Paste a listing you&apos;ve already posted and the form fills itself in. You check it before saving.
              </span>
            </span>
            <ChevronDown className={cx("size-5 shrink-0 text-muted transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
          </button>

          {expanded ? (
            <form action={action} className="pp-fade space-y-3 border-t border-line p-5 sm:p-6">
              <label htmlFor="post" className="sr-only">
                Text of your post
              </label>
              <Textarea
                id="post"
                name="post"
                rows={7}
                maxLength={MAX_POST_CHARS}
                value={post}
                onChange={(e) => setPost(e.target.value)}
                required
                placeholder={"FOR SALE: 2BR corner unit, Mandaluyong\n₱4.8M, RF 20k, Pag-IBIG OK\n64 sqm, 1 parking, ready for occupancy"}
              />
              {state.error ? <Alert>{state.error}</Alert> : null}
              <div className="flex flex-wrap items-center gap-3">
                <button disabled={pending} className={buttonClass("primary")}>
                  {pending ? "Reading your post…" : "Fill in the form"}
                </button>
                <span className="text-xs text-muted">Only the text. You&apos;ll add the post&apos;s photos after saving.</span>
              </div>
            </form>
          ) : null}
        </Card>
      ) : null}

      {filled && !pending && !state.error ? (
        <div className="mb-6">
          <Alert tone="success">
            Filled in from your post. Check every field below before you save: nothing is saved yet.
            {state.missing?.length ? ` Not in the post: ${state.missing.join(", ")}.` : ""}
          </Alert>
        </div>
      ) : null}

      <Card>
        <PropertyForm key={state.nonce ?? 0} action={createProperty} initial={state.values ?? {}} submitLabel="Save property" />
      </Card>
    </>
  );
}
