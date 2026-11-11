"use client";

import { useActionState, useState, useTransition } from "react";
import { ChevronDown, ClipboardPaste, Images } from "lucide-react";
import { Alert, Card, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { MAX_POST_CHARS } from "@/lib/post-import";
import { createProperty } from "../actions";
import { importListing, listPagePosts, type ImportState, type PostSummary } from "../import-actions";
import { PropertyForm } from "../property-form";

type Page = { id: string; name: string };

/** Add property, with an optional "start from a Facebook post" step above the form. */
export function NewProperty({ canPaste, pages }: { canPaste: boolean; pages: Page[] }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importListing, {});
  const filled = Boolean(state.nonce);
  // The panel starts open and folds away after each fill; the header reopens it.
  const key = state.nonce ?? 0;
  const [openFor, setOpenFor] = useState<number | null>(0);
  const expanded = openFor === key;
  const [mode, setMode] = useState<"page" | "paste">(pages.length ? "page" : "paste");
  // Controlled, so the pasted text survives React resetting the form after a submit.
  const [post, setPost] = useState("");

  const show = canPaste || pages.length > 0;

  return (
    <>
      {show ? (
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
                {pages.length
                  ? "Pick a post from your Page, photos included, or paste one. You check the form before saving."
                  : "Paste a listing you've already posted and the form fills itself in. You check it before saving."}
              </span>
            </span>
            <ChevronDown className={cx("size-5 shrink-0 text-muted transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
          </button>

          {expanded ? (
            <div className="pp-fade border-t border-line p-5 sm:p-6">
              {pages.length && canPaste ? (
                <div role="tablist" aria-label="Where the post comes from" className="mb-4 inline-flex rounded-xl bg-zinc-100 p-1 text-sm">
                  {(
                    [
                      ["page", "From your Page"],
                      ["paste", "Paste text"],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => setMode(m)}
                      className={cx(
                        "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                        mode === m ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              {mode === "page" && pages.length ? (
                <PagePicker pages={pages} action={action} pending={pending} />
              ) : (
                <form action={action} className="space-y-3">
                  <input type="hidden" name="source" value="paste" />
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
                  <div className="flex flex-wrap items-center gap-3">
                    <button disabled={pending} className={buttonClass("primary")}>
                      {pending ? "Reading your post…" : "Fill in the form"}
                    </button>
                    <span className="text-xs text-muted">Only the text. You&apos;ll add the post&apos;s photos after saving.</span>
                  </div>
                </form>
              )}
              {state.error ? (
                <div className="mt-3">
                  <Alert>{state.error}</Alert>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {filled && !pending && !state.error ? (
        <div className="mb-6">
          <Alert tone="success">
            Filled in from your post. Check every field below before you save: nothing is saved yet.
            {state.missing?.length ? ` Not in the post: ${state.missing.join(", ")}.` : ""}
            {state.photoCount ? ` Its ${state.photoCount === 1 ? "photo" : `${state.photoCount} photos`} will be added when you save.` : ""}
          </Alert>
        </div>
      ) : null}

      <Card>
        <PropertyForm
          key={state.nonce ?? 0}
          action={createProperty}
          initial={state.values ?? {}}
          submitLabel="Save property"
          hidden={state.importRef ? { importPost: state.importRef } : undefined}
        />
      </Card>
    </>
  );
}

function PagePicker({ pages, action, pending }: { pages: Page[]; action: (form: FormData) => void; pending: boolean }) {
  const [pageId, setPageId] = useState(pages[0]!.id);
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);

  const load = (id: string) =>
    startLoading(async () => {
      setError(null);
      const r = await listPagePosts(id);
      setPosts(r.posts ?? null);
      setError(r.error ?? null);
    });

  return (
    <div className="space-y-4">
      <div className={cx("flex flex-wrap gap-3", pages.length > 1 ? "items-end" : "items-center")}>
        {pages.length > 1 ? (
          <div className="min-w-56">
            <label htmlFor="fb-page" className="text-sm font-medium text-ink">
              Page
            </label>
            <Select
              id="fb-page"
              value={pageId}
              onChange={(e) => {
                setPageId(e.target.value);
                setPosts(null);
              }}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted">
            From <span className="font-medium text-ink">{pages[0]!.name}</span>
          </p>
        )}
        <button type="button" onClick={() => load(pageId)} disabled={loading} className={buttonClass("secondary")}>
          {loading ? "Loading posts…" : posts ? "Refresh" : "Show recent posts"}
        </button>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading && !posts ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pp-skeleton h-28 rounded-xl" />
          ))}
        </div>
      ) : posts ? (
        posts.length ? (
          <ul className="pp-stagger grid max-h-[28rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {posts.map((p, i) => (
              <li key={p.id} style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                <form
                  action={(fd) => {
                    setChosen(p.id);
                    action(fd);
                  }}
                  className="h-full"
                >
                  <input type="hidden" name="source" value="page" />
                  <input type="hidden" name="page" value={pageId} />
                  <input type="hidden" name="postId" value={p.id} />
                  <button
                    disabled={pending}
                    className="pp-lift flex h-full w-full gap-3 rounded-xl border border-line bg-white p-3 text-left hover:border-brand-600 disabled:opacity-60"
                  >
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Facebook-hosted preview
                      <img src={p.image} alt="" className="size-20 shrink-0 rounded-lg bg-zinc-100 object-cover" loading="lazy" />
                    ) : (
                      <span className="grid size-20 shrink-0 place-items-center rounded-lg bg-zinc-100 text-muted">
                        <Images className="size-5" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-3 text-sm text-ink">{p.text}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {pending && chosen === p.id
                          ? "Reading this post…"
                          : `${new Date(p.createdAt).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}${
                              p.photoCount ? `, ${p.photoCount === 1 ? "1 photo" : `${p.photoCount} photos`}` : ""
                            }`}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No posts with text on this Page yet.</p>
        )
      ) : null}
    </div>
  );
}
