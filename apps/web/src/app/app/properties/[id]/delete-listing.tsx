"use client";

import { useState } from "react";
import { Panel, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/** Permanent delete, shown to the app admin only. Two steps, so one slip of the finger can't remove a listing. */
export function DeleteListing({ name, action }: { name: string; action: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  return (
    <Panel title="Delete this listing" className="mt-6">
      <p className="mt-1 max-w-2xl text-sm text-muted">
        App admin only. Deleting removes the listing for good, with its photos, public page, inquiries, view counts and offers. Leads and chats stay, without the
        listing. To take a listing down and keep its records, change its status instead.
      </p>
      {asking ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">
            Delete <q>{name}</q> for good? This can&apos;t be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={action}>
              <SubmitButton variant="danger" pendingText="Deleting…">
                Yes, delete it for good
              </SubmitButton>
            </form>
            <button type="button" onClick={() => setAsking(false)} className={buttonClass("secondary")}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={`${buttonClass("danger")} mt-4`}>
          Delete permanently…
        </button>
      )}
    </Panel>
  );
}
