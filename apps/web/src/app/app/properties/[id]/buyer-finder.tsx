"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { Icon3d } from "@/components/icon-3d";
import { SubmitButton } from "@/components/submit-button";
import type { BuyerFinderResult, LeadMatch } from "@/lib/buyer-finder";
import { addPotentialBuyer, type AddState } from "./buyer-finder-actions";

const STAGE_LABEL: Record<string, string> = {
  inquiry: "Inquiry",
  qualified: "Qualified",
  viewing: "Viewing",
  offer: "Offer",
  reservation: "Reservation",
};
const SOURCE_LABEL: Record<string, string> = {
  viewing_request: "Listing inquiry",
  messenger: "Messenger",
  app_chat: "HomeFinder chat",
  manual: "Added by hand",
};

/** Buyer Finder on a listing: leads that fit, and the ones already added as potential buyers. */
export function BuyerFinder({ propertyId, data }: { propertyId: string; data: BuyerFinderResult }) {
  const left = data.limit === null ? null : Math.max(0, data.limit - data.usedThisMonth);
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon3d name="target" size={44} />
          <div>
            <h2 className="text-lg font-bold tracking-tight">Buyer Finder</h2>
            <p className="mt-0.5 text-sm text-muted">Leads whose budget, area and type fit this listing. The AI reads each chat for these details.</p>
          </div>
        </div>
        {data.limit !== null ? (
          <p className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 tabular-nums">
            {data.usedThisMonth} of {data.limit} found this month
          </p>
        ) : null}
      </div>

      {data.added.length ? (
        <>
          <h3 className="mt-6 text-sm font-semibold">Potential buyers for this listing</h3>
          <ul className="mt-2 divide-y divide-line">
            {data.added.map((l) => (
              <li key={l.id}>
                <LeadRow lead={l} right={<span className="flex items-center gap-1.5 text-sm font-medium text-good"><Check className="size-4" aria-hidden /> Added</span>} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className="mt-6 text-sm font-semibold">Suggested</h3>
      {data.suggestions.length ? (
        <ul className="mt-2 divide-y divide-line">
          {data.suggestions.map((l) => (
            <li key={l.id}>
              <LeadRow lead={l} right={<AddButton propertyId={propertyId} prospectId={l.id} disabled={left === 0} />} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No leads fit yet. Share this listing&apos;s public page and connect your Facebook Page: every inquiry becomes a lead, and leads need at least two of budget, area and
          property type to be matched.
        </p>
      )}
    </Card>
  );
}

function LeadRow({ lead, right }: { lead: LeadMatch; right: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 sm:flex-nowrap">
      <Link href={`/app/pipeline/${lead.id}`} className="min-w-0 basis-full hover:underline sm:basis-0 sm:flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{lead.name}</span>
          {lead.temperature ? <Badge tone={lead.temperature === "hot" ? "hot" : "neutral"}>{lead.temperature[0]!.toUpperCase() + lead.temperature.slice(1)}</Badge> : null}
          <span className="text-xs text-muted">
            {SOURCE_LABEL[lead.source] ?? lead.source} · {STAGE_LABEL[lead.stage] ?? lead.stage}
          </span>
        </span>
        {lead.match ? (
          <span className="mt-0.5 block text-xs text-muted">
            <span className="font-semibold text-ink tabular-nums">{lead.match.score}% match</span>
            {lead.match.fits.length ? ` · ${lead.match.fits.join(", ")}` : ""}
            {lead.match.gaps.length ? <span className="text-hot"> · {lead.match.gaps.join(", ")}</span> : null}
          </span>
        ) : null}
      </Link>
      {right}
    </div>
  );
}

function AddButton({ propertyId, prospectId, disabled }: { propertyId: string; prospectId: string; disabled: boolean }) {
  const [state, action] = useActionState<AddState>(addPotentialBuyer.bind(null, propertyId, prospectId), {});
  if (state.added) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-good">
        <Check className="size-4" aria-hidden /> Added
      </span>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton variant="secondary" pendingText="Adding…" {...(disabled ? { disabled: true, title: "This month's allowance is used up" } : {})}>
        Add as potential buyer
      </SubmitButton>
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
      <Icon3d name="target" size={44} />
      <div className="text-sm">
        <p className="font-semibold">Buyer Finder is part of the paid plans</p>
        <p className="mt-0.5 text-muted">The AI reads your chats and inquiries for budget and area, then shows which leads fit this listing: 5 a month on Basic, 20 on Pro.</p>
        {canUpgrade ? (
          <Link href="/app/billing" className="mt-2 inline-block font-semibold text-brand-700 hover:underline">
            See plans, from ₱499 a month
          </Link>
        ) : (
          <p className="mt-2 text-muted">An owner can upgrade in Billing.</p>
        )}
      </div>
    </Card>
  );
}
