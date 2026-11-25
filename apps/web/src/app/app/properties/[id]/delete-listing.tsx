"use client";

import { useSay } from "@/components/lang";
import { useState } from "react";
import { Panel, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/** Permanent delete, shown to the app admin only. Two steps, so one slip of the finger can't remove a listing. */
export function DeleteListing({ name, action }: { name: string; action: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const say = useSay();
  return (
    <Panel title="Delete this listing" className="mt-6">
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {say(
          "App admin only. Deleting removes the listing for good, with its photos, public page, inquiries, view counts and offers. Leads and chats stay, without the listing. To take a listing down and keep its records, change its status instead.",
          "Para sa app admin lang. Kapag dinelete, tuluyan nang mawawala ang listing, kasama ang photos, public page, inquiries, view counts at offers nito. Mananatili ang leads at chats, pero wala na ang listing. Kung gusto mo lang itong alisin pero itago ang records, palitan na lang ang status.",
        )}
      </p>
      {asking ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">
            {say("Delete", "Buburahin na talaga ang")} <q>{name}</q>
            {say(" for good? This can't be undone.", "? Hindi na ito maibabalik.")}
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
