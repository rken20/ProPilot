"use client";

import { useSay } from "@/components/lang";
import { useActionState, type ReactNode } from "react";
import { PROPERTY_STATUSES, PROPERTY_TYPES } from "@propilot/shared";
import { Icon3d } from "@/components/icon-3d";
import { Alert, Field, IconTitle, Input, Label, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/form";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/property-labels";
import { WriteDescriptionButton } from "./write-description";

export type PropertyFormValues = Record<string, string>;

export function PropertyForm({
  action,
  initial,
  submitLabel,
  readOnly = false,
  hidden,
  aiWrite = false,
  priceHelp,
  negotiation,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: PropertyFormValues;
  submitLabel: string;
  readOnly?: boolean;
  /** Extra hidden fields, e.g. the Facebook post a new listing came from. */
  hidden?: Record<string, string>;
  /** Show "Write with AI" for the description (plans with AI only). */
  aiWrite?: boolean;
  /** Shown under the price fields, e.g. the Pricing Advisor on Add a Property. */
  priceHelp?: ReactNode;
  /**
   * AI negotiation on Add a Property (Pro, Agency): "set" asks the owner or an
   * admin for the lowest price (required); "later" tells an agent that the owner
   * or an admin sets it.
   */
  negotiation?: "set" | "later";
}) {
  const say = useSay();
  const [state, formAction] = useActionState(action, { data: initial });
  const v = state.data ?? initial;
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {hidden ? Object.entries(hidden).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />) : null}
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <fieldset disabled={readOnly} className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Property name" htmlFor="name" error={e.name} hint={say("As buyers will see it, e.g. 2BR Unit 12A, Avida Towers", "Ito ang makikita ng buyers, hal. 2BR Unit 12A, Avida Towers")}>
              <Input id="name" name="name" defaultValue={v.name} required />
            </Field>
          </div>
          <Field label="Type" htmlFor="type" error={e.type}>
            <Select id="type" name="type" defaultValue={v.type || "condominium"}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status" error={e.status}>
            <Select id="status" name="status" defaultValue={v.status || "available"}>
              {PROPERTY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Location" htmlFor="location" error={e.location} hint={say("Barangay, city, landmark", "Barangay, city, landmark")}>
              <Input id="location" name="location" defaultValue={v.location} required />
            </Field>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Selling price (₱)" htmlFor="price" error={e.price}>
            <Input id="price" name="price" inputMode="decimal" defaultValue={v.price} placeholder="4,500,000" required />
          </Field>
          <Field label="Reservation fee (₱)" htmlFor="reservationFee" error={e.reservationFee} hint="Optional">
            <Input id="reservationFee" name="reservationFee" inputMode="decimal" defaultValue={v.reservationFee} placeholder="25,000" />
          </Field>
        </section>
        {priceHelp && !readOnly ? priceHelp : null}

        {negotiation === "set" && !readOnly ? (
          <section className="rounded-2xl border border-brand-100 bg-tile-sky/60 p-4 sm:p-5">
            <IconTitle icon="robot" className="text-sm font-semibold">
              AI negotiation
            </IconTitle>
            <p className="mt-1 text-sm text-muted">
              {say(
                "Private: only you and your admins see these, and the AI is never told the numbers. When a buyer names a price, the AI counters in smaller and smaller steps and never goes under your lowest price.",
                "Private: ikaw at ang admins mo lang ang nakakakita nito, at hindi sinasabi sa AI ang mga numero. Kapag may buyer na nagsabi ng presyo, unti-unting magbababa ang counteroffer ng AI at hindi ito bababa sa lowest price mo.",
              )}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="Lowest price you'd accept (₱)"
                htmlFor="lowestPrice"
                error={e.lowestPrice}
                hint={say("Required. At or under the selling price. Use the selling price if the AI shouldn't come down at all.", "Required. Kapantay o mas mababa sa selling price. Ilagay ang selling price kung ayaw mong magbaba ang AI.")}
              >
                <Input id="lowestPrice" name="lowestPrice" inputMode="decimal" defaultValue={v.lowestPrice} placeholder="4,200,000" required />
              </Field>
              <Field
                label="Accept right away at or above (₱)"
                htmlFor="acceptPrice"
                error={e.acceptPrice}
                hint={say("Optional. The AI closes the deal by itself at this price or more; offers between the two come to you to confirm.", "Optional. Kusang iko-close ng AI ang deal sa presyong ito o mas mataas; ang offers sa pagitan ng dalawa ay ipapa-confirm sa'yo.")}
              >
                <Input id="acceptPrice" name="acceptPrice" inputMode="decimal" defaultValue={v.acceptPrice} placeholder="4,400,000" />
              </Field>
            </div>
          </section>
        ) : negotiation === "later" && !readOnly ? (
          <p className="flex items-start gap-2 rounded-2xl bg-tile-sky/60 p-4 text-sm text-ink/80">
            <Icon3d name="robot" size={22} className="shrink-0" />
            {say(
              "The owner or an admin sets the AI's lowest price for this listing after you save. Until then, the AI passes price offers to the team.",
              "Ang owner o isang admin ang magse-set ng lowest price ng AI para sa listing na ito pagka-save mo. Hanggang doon, ipapasa ng AI sa team ang mga price offer.",
            )}
          </p>
        ) : null}

        <section className="space-y-3">
          <p className="text-sm font-medium text-zinc-800">Financing options</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {[
              ["bankFinancing", "Bank financing"],
              ["pagIbig", "Pag-IBIG"],
              ["inHouse", "In-house financing"],
            ].map(([key, label]) => (
              <Label key={key} className="flex items-center gap-2 font-normal">
                <input type="checkbox" name={key} defaultChecked={v[key!] === "on"} className="size-4 accent-brand-600" />
                {label}
              </Label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Downpayment (%)" htmlFor="downpaymentPercent" error={e.downpaymentPercent} hint="Optional">
              <Input id="downpaymentPercent" name="downpaymentPercent" inputMode="decimal" defaultValue={v.downpaymentPercent} placeholder="20" />
            </Field>
            <Field label="Financing notes" htmlFor="financingNotes" hint={say("Terms the assistant may quote, e.g. up to 20 years", "Terms na pwedeng sabihin ng assistant, hal. up to 20 years")}>
              <Input id="financingNotes" name="financingNotes" defaultValue={v.financingNotes} />
            </Field>
          </div>
        </section>

        <Label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 font-normal">
          <input type="checkbox" name="isPublic" defaultChecked={v.isPublic === "on"} className="mt-0.5 size-4 accent-brand-600" />
          <span>
            <span className="block font-semibold text-ink">Give it a public page</span>
            <span className="block text-sm text-muted">
              {say(
                "Anyone with the link can see the listing and send you an inquiry, no account needed, and search engines like Google can list it. Share the link on Facebook, Messenger or by text. Untick to keep it private. Sold and archived listings are always hidden.",
                "Kahit sino na may link, makikita ang listing at makakapag-send ng inquiry sa'yo, hindi kailangan ng account, at pwede rin itong lumabas sa Google. I-share ang link sa Facebook, Messenger o text. I-untick kung gusto mong private lang. Laging naka-hide ang sold at archived listings.",
              )}
            </span>
          </span>
        </Label>

        <Field label="Description" htmlFor="description" error={e.description} hint={say("Features, inclusions, nearby places. The assistant uses only what's written here.", "Features, inclusions, mga malapit na lugar. Ang nakasulat lang dito ang gagamitin ng assistant.")}>
          <Textarea id="description" name="description" defaultValue={v.description} rows={5} />
        </Field>
        {aiWrite && !readOnly ? <WriteDescriptionButton targetId="description" /> : null}
      </fieldset>

      {readOnly ? null : <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>}
    </form>
  );
}
