"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Badge, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPeso } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { answerOffer, saveLowestPrice, type DecideState, type FloorState } from "./offer-actions";

export type Offer = {
  id: string;
  amountMinor: number;
  counterMinor: number | null;
  outcome: "too_low" | "countered" | "pending" | "confirmed" | "declined";
  buyerName: string | null;
  listingName: string | null;
  conversationId: string | null;
  createdAt: string;
  /** What the buyer is told for each answer (pending offers only). */
  messages?: { confirm: string; decline: string };
};

const OUTCOME: Record<Offer["outcome"], { label: string; tone: "neutral" | "brand" | "hot" }> = {
  too_low: { label: "Too low", tone: "neutral" },
  countered: { label: "AI asked for more", tone: "neutral" },
  pending: { label: "Waiting for the owner", tone: "hot" },
  confirmed: { label: "Confirmed", tone: "brand" },
  declined: { label: "Declined", tone: "neutral" },
};

/** Offers the AI collected, newest first. Owners and admins answer the pending one here. */
export function Offers({ offers, canDecide, showListing = false, linkToChat = false, title = "Offers" }: { offers: Offer[]; canDecide: boolean; showListing?: boolean; linkToChat?: boolean; title?: string }) {
  if (!offers.length) return null;
  return (
    <Card className="mt-5">
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      <ul className="mt-2 divide-y divide-line">
        {offers.map((o) => (
          <OfferRow key={o.id} offer={o} canDecide={canDecide} showListing={showListing} linkToChat={linkToChat} />
        ))}
      </ul>
    </Card>
  );
}

function OfferRow({ offer: o, canDecide, showListing, linkToChat }: { offer: Offer; canDecide: boolean; showListing: boolean; linkToChat: boolean }) {
  // The answer's result stays on the row after the offer stops being pending.
  const [yes, confirm] = useActionState<DecideState, FormData>(answerOffer.bind(null, o.id, true), {});
  const [no, decline] = useActionState<DecideState, FormData>(answerOffer.bind(null, o.id, false), {});
  const state = yes.error || yes.notice ? yes : no;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-sm">
          <span className="text-base font-extrabold tabular-nums">{formatPeso(o.amountMinor)}</span>
          {showListing && o.listingName ? <span className="text-muted"> for {o.listingName}</span> : null}
          {o.buyerName ? <span className="text-muted"> from {o.buyerName}</span> : null}
        </p>
        <p className="flex items-center gap-2 text-xs text-muted">
          <Badge tone={OUTCOME[o.outcome].tone}>{OUTCOME[o.outcome].label}</Badge>
          {timeAgo(o.createdAt)}
        </p>
      </div>
      {o.outcome === "countered" && o.counterMinor ? <p className="mt-1 text-xs text-muted">The AI asked if they can do {formatPeso(o.counterMinor)}.</p> : null}
      {o.outcome === "pending" ? (
        canDecide && o.messages ? (
          <div className="mt-3 rounded-2xl bg-tile-lemon p-4">
            <p className="text-sm font-semibold">Nothing is final until you answer.</p>
            <p className="mt-1 text-xs text-ink/75">
              If you confirm, the buyer is told: <q>{o.messages.confirm}</q>
            </p>
            <p className="mt-1 text-xs text-ink/75">
              If you decline: <q>{o.messages.decline}</q>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={confirm}>
                <SubmitButton pendingText="Confirming…">Confirm and tell the buyer</SubmitButton>
              </form>
              <form action={decline}>
                <SubmitButton variant="secondary" pendingText="Declining…">
                  Decline and tell the buyer
                </SubmitButton>
              </form>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">Only the owner or an admin can confirm or decline it.</p>
        )
      ) : null}
      {state.error ? (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      ) : state.notice ? (
        <div className="mt-3">
          <Alert tone="success">{state.notice}</Alert>
        </div>
      ) : null}
      {linkToChat && o.conversationId ? (
        <Link href={`/app/inbox?c=${o.conversationId}`} className="mt-1 inline-block text-xs font-bold text-grape-700 hover:underline">
          Open the conversation
        </Link>
      ) : null}
    </li>
  );
}

/** The private lowest price for one listing (owners and admins, on plans with AI negotiation). */
export function LowestPrice({ propertyId, askingMinor, currentPesos }: { propertyId: string; askingMinor: number; currentPesos: string }) {
  const [state, action] = useActionState<FloorState, FormData>(saveLowestPrice.bind(null, propertyId), {});
  return (
    <Card className="mt-6">
      <h3 className="text-xl font-bold tracking-tight">AI negotiation</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        When a buyer names a price in the chat, the AI turns down offers under your lowest price, asks once for more on the rest, then sends the offer to you. You
        confirm or decline every offer. Only you and your admins can see this number, and the AI is never told it.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Field label="Lowest price you'd accept (₱)" htmlFor="lowestPrice" hint={`Asking price: ${formatPeso(askingMinor)}. Leave empty to have a person handle every offer.`}>
            <Input id="lowestPrice" name="lowestPrice" inputMode="decimal" defaultValue={currentPesos} placeholder="4500000" />
          </Field>
        </div>
        <SubmitButton variant="secondary" pendingText="Saving…" className="mb-6">
          Save
        </SubmitButton>
      </form>
      {state.error ? <Alert>{state.error}</Alert> : state.saved ? <Alert tone="success">Saved.</Alert> : null}
    </Card>
  );
}
