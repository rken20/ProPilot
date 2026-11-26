"use client";

import { useSay } from "@/components/lang";
import Link from "next/link";
import { useActionState } from "react";
import { Alert, Badge, Field, Input, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPeso } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { answerOffer, saveLowestPrice, type DecideState, type FloorState } from "./offer-actions";

export type Offer = {
  id: string;
  amountMinor: number;
  counterMinor: number | null;
  outcome: "too_low" | "countered" | "pending" | "confirmed" | "declined" | "accepted";
  buyerName: string | null;
  listingName: string | null;
  conversationId: string | null;
  createdAt: string;
  /** An agreed deal's reference, as the buyer saw it. */
  ref?: string | null;
  /** What the buyer is told for each answer (pending offers only). */
  messages?: { confirm: string; decline: string };
};

const OUTCOME: Record<Offer["outcome"], { label: string; tone: "neutral" | "brand" | "hot" }> = {
  too_low: { label: "Too low, AI countered", tone: "neutral" },
  countered: { label: "AI asked for more", tone: "neutral" },
  pending: { label: "Waiting for the owner", tone: "hot" },
  confirmed: { label: "Confirmed", tone: "brand" },
  declined: { label: "Declined", tone: "neutral" },
  accepted: { label: "Deal agreed by the AI", tone: "brand" },
};

/** Offers the AI collected, newest first. Owners and admins answer the pending one here. */
export function Offers({ offers, canDecide, showListing = false, linkToChat = false, title = "Offers" }: { offers: Offer[]; canDecide: boolean; showListing?: boolean; linkToChat?: boolean; title?: string }) {
  if (!offers.length) return null;
  return (
    <Panel icon3d="money" title={title} className="mt-5">
      <ul className="mt-2 divide-y divide-line">
        {offers.map((o) => (
          <OfferRow key={o.id} offer={o} canDecide={canDecide} showListing={showListing} linkToChat={linkToChat} />
        ))}
      </ul>
    </Panel>
  );
}

function OfferRow({ offer: o, canDecide, showListing, linkToChat }: { offer: Offer; canDecide: boolean; showListing: boolean; linkToChat: boolean }) {
  const say = useSay();
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
      {o.outcome === "too_low" && o.counterMinor ? <p className="mt-1 text-xs text-muted">The AI offered {formatPeso(o.counterMinor)} back.</p> : null}
      {o.outcome === "accepted" ? (
        <p className="mt-1 text-xs text-muted">
          {o.ref ? (
            <>
              Reference no. <span className="font-bold text-ink tabular-nums">{o.ref}</span>.{" "}
            </>
          ) : null}
          {say(
            "It met the price you pre-approved, so the AI agreed it and is collecting the buyer's details for the reservation. Send the reservation agreement and official payment instructions in the chat. A deal only counts if its reference is listed here.",
            "Naabot nito ang presyong pre-approved mo, kaya pumayag na ang AI at kinukuha na nito ang details ng buyer para sa reservation. I-send ang reservation agreement at official payment instructions sa chat. Valid lang ang deal kung nakalista rito ang reference nito.",
          )}
        </p>
      ) : null}
      {o.outcome === "pending" ? (
        canDecide && o.messages ? (
          <div className="mt-3 rounded-2xl bg-tile-lemon p-4">
            <p className="text-sm font-semibold">{say("Nothing is final until you answer.", "Walang final hangga't hindi ka sumasagot.")}</p>
            <p className="mt-1 text-xs text-ink/75">
              {say("If you confirm, the buyer is told:", "Kapag kinonfirm mo, ito ang sasabihin sa buyer:")} <q>{o.messages.confirm}</q>
            </p>
            <p className="mt-1 text-xs text-ink/75">
              {say("If you decline:", "Kapag dineclin mo:")} <q>{o.messages.decline}</q>
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
          <p className="mt-1 text-xs text-muted">{say("Only the owner or an admin can confirm or decline it.", "Owner o admin lang ang pwedeng mag-confirm o mag-decline nito.")}</p>
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

/** The private prices for one listing (owners and admins, on plans with AI negotiation). */
export function LowestPrice({ propertyId, askingMinor, currentPesos, acceptPesos }: { propertyId: string; askingMinor: number; currentPesos: string; acceptPesos: string }) {
  const say = useSay();
  const [state, action] = useActionState<FloorState, FormData>(saveLowestPrice.bind(null, propertyId), {});
  return (
    <Panel icon3d="robot" title="AI negotiation" className="mt-6">
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {say(
          "When a buyer names a price in the chat, the AI negotiates like an agent: it offers counteroffers that come down in smaller and smaller steps, never under your lowest price. Only you and your admins can see these numbers, and the AI is never told them.",
          "Kapag may buyer na nagsabi ng presyo sa chat, nakikipag-negotiate ang AI na parang agent: nagbibigay ito ng counteroffers na paliit nang paliit ang bawas, at hindi bababa sa lowest price mo. Ikaw at ang admins mo lang ang nakakakita ng mga numerong ito, at hindi ito sinasabi sa AI.",
        )}
      </p>
      <form action={action} className="mt-4">
        <div className="grid max-w-2xl gap-x-4 sm:grid-cols-2">
          <Field label="Lowest price you'd accept (₱)" htmlFor="lowestPrice" hint={say(`Asking price: ${formatPeso(askingMinor)}. Leave empty to have a person handle every offer.`, `Asking price: ${formatPeso(askingMinor)}. Iwanang blangko kung tao ang hahawak sa bawat offer.`)}>
            <Input id="lowestPrice" name="lowestPrice" inputMode="decimal" defaultValue={currentPesos} placeholder="4500000" />
          </Field>
          <Field
            label="Accept right away at or above (₱)"
            htmlFor="acceptPrice"
            hint={say("Optional. The AI closes the deal by itself at this price or more. Offers between this and your lowest price still come to you to confirm.", "Optional. Kusang iko-close ng AI ang deal sa presyong ito o mas mataas. Ang offers sa pagitan nito at ng lowest price mo, sa'yo pa rin dadaan para i-confirm.")}
          >
            <Input id="acceptPrice" name="acceptPrice" inputMode="decimal" defaultValue={acceptPesos} placeholder="4800000" />
          </Field>
        </div>
        <SubmitButton variant="secondary" pendingText="Saving…" className="mb-2">
          Save
        </SubmitButton>
      </form>
      {state.error ? <Alert>{state.error}</Alert> : state.saved ? <Alert tone="success">Saved.</Alert> : null}
    </Panel>
  );
}
