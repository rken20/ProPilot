"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check, Sparkles, UserSearch } from "lucide-react";
import { Badge, buttonClass, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { BuyerFinderResult } from "@/lib/buyer-finder";
import type { Match } from "@/lib/matching";
import { sendToBuyer } from "./buyer-finder-actions";

const STAGE_LABEL: Record<string, string> = {
  inquiry: "Inquiry",
  qualified: "Qualified",
  viewing: "Viewing",
  offer: "Offer",
  reservation: "Reservation",
};

/** Buyer Finder on a listing: matching leads, then opted-in Home Finder buyers. */
export function BuyerFinder({ propertyId, data, isPublic, canSend }: { propertyId: string; data: BuyerFinderResult; isPublic: boolean; canSend: boolean }) {
  const left = data.limit === null ? null : Math.max(0, data.limit - data.usedThisMonth);
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UserSearch className="size-5 text-brand-600" aria-hidden /> Buyer Finder
          </h2>
          <p className="mt-0.5 text-sm text-muted">Buyers whose budget, area and type fit this listing.</p>
        </div>
        {left !== null ? (
          <p className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted tabular-nums">
            {left} of {data.limit} sends left this month
          </p>
        ) : null}
      </div>

      <h3 className="mt-6 text-sm font-semibold">In your pipeline</h3>
      {data.pipeline.length ? (
        <ul className="mt-2 divide-y divide-line">
          {data.pipeline.map((p) => (
            <li key={p.id}>
              <Link href={`/app/pipeline/${p.id}`} className="-mx-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-surface">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{p.name}</span>
                  <Reasons match={p.match} />
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {p.temperature ? <Badge tone={p.temperature === "hot" ? "hot" : "neutral"}>{p.temperature[0]!.toUpperCase() + p.temperature.slice(1)}</Badge> : null}
                  {STAGE_LABEL[p.stage] ?? p.stage}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No open leads fit yet. Leads need at least two of budget, area and type to be matched.</p>
      )}

      <h3 className="mt-6 text-sm font-semibold">Home Finder buyers looking for this</h3>
      <p className="mt-0.5 text-xs text-muted">
        These buyers asked to get matching listings from agents. You see what they want, not who they are. Send the listing and they decide whether to message you.
      </p>
      {!isPublic ? (
        <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-4 text-sm text-muted">
          Show this listing to Home Finder buyers (in the details above) to find buyers for it.
        </p>
      ) : data.buyers.length ? (
        <ul className="mt-2 divide-y divide-line">
          {data.buyers.map((b) => (
            <li key={b.handle} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 sm:flex-nowrap">
              <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <span className="block text-sm font-medium">{b.search.join(" · ") || "Buyer"}</span>
                <Reasons match={b.match} />
              </span>
              {b.sent ? (
                <span className="flex items-center gap-1.5 text-sm text-good">
                  <Check className="size-4" aria-hidden /> Sent
                </span>
              ) : canSend ? (
                <SendButton propertyId={propertyId} handle={b.handle} disabled={left === 0} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No opted-in buyers fit this listing right now. New buyers join every day, so check back.</p>
      )}
    </Card>
  );
}

function Reasons({ match }: { match: Match }) {
  return (
    <span className="mt-0.5 block text-xs text-muted">
      <span className="font-medium text-ink tabular-nums">{match.score}% match</span>
      {match.fits.length ? ` · ${match.fits.join(", ")}` : ""}
      {match.gaps.length ? <span className="text-hot"> · {match.gaps.join(", ")}</span> : null}
    </span>
  );
}

function SendButton({ propertyId, handle, disabled }: { propertyId: string; handle: string; disabled: boolean }) {
  const [state, action] = useActionState(sendToBuyer.bind(null, propertyId, handle), {});
  if (state.sent) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-good">
        <Check className="size-4" aria-hidden /> Sent
      </span>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      {disabled ? (
        <button type="button" disabled className={buttonClass("secondary", "opacity-50")} title="This month's sends are used up">
          Send this listing
        </button>
      ) : (
        <SubmitButton variant="secondary" pendingText="Sending…">
          Send this listing
        </SubmitButton>
      )}
      {state.error ? (
        <p role="alert" className="max-w-60 text-right text-xs text-hot">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** In place of Buyer Finder on Free. */
export function BuyerFinderUpgrade({ canUpgrade }: { canUpgrade: boolean }) {
  return (
    <Card className="mt-6 flex items-start gap-3">
      <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
      <div className="text-sm">
        <p className="font-semibold">Buyer Finder is part of Basic</p>
        <p className="mt-0.5 text-muted">
          See which leads in your pipeline fit this listing, and send it to up to 5 Home Finder buyers a month whose search matches.
        </p>
        {canUpgrade ? (
          <Link href="/app/billing" className="mt-2 inline-block font-semibold text-brand-700 hover:underline">
            See Basic, ₱499 a month
          </Link>
        ) : (
          <p className="mt-2 text-muted">An owner can upgrade in Billing.</p>
        )}
      </div>
    </Card>
  );
}
