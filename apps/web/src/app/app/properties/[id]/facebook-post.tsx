"use client";

import { useActionState, useState, useTransition } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Alert, Badge, Card, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { MAX_CAPTION } from "@/lib/listing-caption";
import { draftCaption, publishToFacebook, type PublishState } from "./facebook-actions";

type Page = { id: string; name: string; canPost: boolean };
export type FacebookPostLog = {
  id: string;
  page_name: string;
  status: "published" | "failed";
  kind: string;
  permalink_url: string | null;
  error: string | null;
  created_at: string;
};

/** Post this listing to a connected Facebook Page. Nothing is posted until someone presses Post. */
export function FacebookPost({
  propertyId,
  pages,
  photoCount,
  initialCaption,
  history,
  aiAvailable,
}: {
  propertyId: string;
  pages: Page[];
  photoCount: number;
  initialCaption: string;
  history: FacebookPostLog[];
  aiAvailable: boolean;
}) {
  const [state, action, pending] = useActionState<PublishState, FormData>(publishToFacebook.bind(null, propertyId), {});
  const postable = pages.filter((p) => p.canPost);
  const [caption, setCaption] = useState(initialCaption);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();

  const draft = () =>
    startDraft(async () => {
      setDraftError(null);
      const r = await draftCaption(propertyId);
      if (r.caption) setCaption(r.caption);
      setDraftError(r.error ?? null);
    });

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium">Post to Facebook</h2>
          <p className="mt-1 text-sm text-muted">Share this listing on your Page. Edit the caption first; nothing is posted until you press Post.</p>
        </div>
      </div>

      {postable.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          You need to be an admin or editor of a connected Page to post. Check your role on the Page in Facebook, then reconnect it in
          Integrations.
        </p>
      ) : (
        <form action={action} className="mt-5 space-y-4">
          {state.postedTo && !pending ? (
            <Alert tone="success">
              Posted to {state.postedTo}.{" "}
              {state.link ? (
                <a href={state.link} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                  View the post
                </a>
              ) : null}
            </Alert>
          ) : null}
          {state.error ? <Alert>{state.error}</Alert> : null}

          {postable.length > 1 ? (
            <div className="max-w-sm">
              <label htmlFor="fb-post-page" className="text-sm font-medium text-ink">
                Page
              </label>
              <Select id="fb-post-page" name="page" defaultValue={postable[0]!.id}>
                {postable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <input type="hidden" name="page" value={postable[0]!.id} />
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="fb-caption" className="text-sm font-medium text-ink">
                Caption
              </label>
              {aiAvailable ? (
                <button
                  type="button"
                  onClick={draft}
                  disabled={drafting}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60"
                >
                  <Sparkles className={cx("size-4", drafting && "animate-pulse")} aria-hidden />
                  {drafting ? "Writing…" : "Write with AI"}
                </button>
              ) : null}
            </div>
            <Textarea
              id="fb-caption"
              name="caption"
              rows={9}
              maxLength={MAX_CAPTION}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className={cx(drafting && "opacity-60")}
            />
            {draftError ? <p className="mt-1.5 text-sm text-red-700">{draftError}</p> : null}
          </div>

          {photoCount ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="photos" defaultChecked className="size-4 accent-brand-600" />
              Include photos ({Math.min(photoCount, 10)}
              {photoCount > 10 ? ` of ${photoCount}, the first 10` : ""})
            </label>
          ) : (
            <p className="text-sm text-muted">This listing has no photos yet, so the post will be text only.</p>
          )}

          <button disabled={pending || drafting} className={buttonClass("primary")}>
            {pending ? "Posting…" : postable.length > 1 ? "Post to Facebook" : `Post to ${postable[0]!.name}`}
          </button>
        </form>
      )}

      {history.length ? (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">Posted from ProPilot</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge tone={h.status === "published" ? "brand" : "hot"}>{h.status === "published" ? "Posted" : "Failed"}</Badge>
                <span className="text-ink">{h.page_name}</span>
                <span className="text-muted">
                  {new Date(h.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}
                </span>
                {h.permalink_url ? (
                  <a href={h.permalink_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700">
                    View <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
                {h.error ? <span className="w-full text-xs text-muted">{h.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
