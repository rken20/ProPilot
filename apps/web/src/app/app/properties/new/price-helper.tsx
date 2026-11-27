"use client";

import { useSay } from "@/components/lang";
import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Alert, Field, Input, Select, buttonClass, cx } from "@/components/ui";
import { Icon3d } from "@/components/icon-3d";
import {
  CONDITIONS,
  CONDITION_LABEL,
  PRICING_TYPES,
  type PricingReport,
} from "@/lib/pricing-advisor";
import { checkPrice } from "../../pricing/actions";
import { PriceReport } from "../../pricing/pricing-view";

export type PriceHelperPlan =
  /** The plan has no price checks: show what it does and where to get it. */
  | { kind: "upgrade"; canSeeBilling: boolean }
  | { kind: "ready"; left: number | null; limit: number | null };

/**
 * The Pricing Advisor inside Add a Property. It reads the location and type the
 * owner already typed, asks for the few details the form doesn't have, and
 * "Use this price" only fills the price field. The owner can still type any
 * price; nothing is saved until they press Save property.
 *
 * It sits inside the property form, so it has no <form> of its own and its
 * inputs have no names: they are never sent with the property.
 */
export function PriceHelper({ plan }: { plan: PriceHelperPlan }) {
  const [open, setOpen] = useState(false);
  const say = useSay();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [report, setReport] = useState<PricingReport | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(plan.kind === "ready" ? plan.left : null);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  const value = (k: string) =>
    (
      box.current?.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[data-k="${k}"]`,
      )?.value ?? ""
    ).trim();
  const outer = (k: string) =>
    (
      document.getElementById(k) as HTMLInputElement | HTMLSelectElement | null
    )?.value.trim() ?? "";

  function run() {
    if (pending) return;
    setError(null);
    setFieldErrors({});
    const location = outer("location");
    const type = outer("type");
    if (!location)
      return setError(
        say("Type the property's location in the form first: the barangay, town or city, and province.", "I-type muna ang location ng property sa form: barangay, town o city, at province."),
      );
    if (!(PRICING_TYPES as readonly string[]).includes(type))
      return setError(
        say("The Pricing Advisor covers condos, houses, townhouses and lots.", "Para sa condo, house, townhouse at lot ang Pricing Advisor."),
      );
    const form = new FormData();
    form.set("location", location);
    form.set("type", type);
    for (const k of [
      "floorArea",
      "lotArea",
      "bedrooms",
      "bathrooms",
      "condition",
    ])
      form.set(k, value(k));
    start(async () => {
      // A failed or timed-out check must not take the half-filled form down with it.
      let res: Awaited<ReturnType<typeof checkPrice>>;
      try {
        res = await checkPrice(null, {}, form);
      } catch {
        setError(
          say("The price check didn't finish. Your form is safe. Try again in a moment.", "Hindi natapos ang price check. Safe ang form mo. Subukan ulit maya-maya."),
        );
        return;
      }
      setFieldErrors(res.fieldErrors ?? {});
      if (res.fieldErrors?.location)
        setError(`Location: ${res.fieldErrors.location}`);
      if (res.error) setError(res.error);
      if (res.report) {
        setReport(res.report);
        setPicked(null);
        setLeft((n) => (n === null ? null : Math.max(0, n - 1)));
      }
    });
  }

  function pick(priceMinor: number) {
    const input = document.getElementById("price") as HTMLInputElement | null;
    if (!input) return;
    input.value = Math.round(priceMinor / 100).toLocaleString("en-PH");
    // Let the financing section recompute its monthly payments.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    setPicked(priceMinor);
  }

  return (
    <div
      ref={box}
      className="rounded-[1.25rem] border border-grape-100 bg-grape-50/60"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Icon3d name="money" size={40} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">
            {say("Not sure what price to ask?", "Hindi sure kung magkano ang presyo?")}
          </span>
          <span className="block text-sm text-muted">
            {plan.kind === "upgrade"
              ? say("The Pricing Advisor compares similar listings nearby and suggests three prices. Part of the Agency plan.", "Kino-compare ng Pricing Advisor ang mga katulad na listing sa malapit at nagsa-suggest ng tatlong presyo. Kasama ito sa Agency plan.")
              : say("The Pricing Advisor compares similar listings nearby and suggests three prices. You choose whether to use one.", "Kino-compare ng Pricing Advisor ang mga katulad na listing sa malapit at nagsa-suggest ng tatlong presyo. Ikaw ang bahala kung gagamitin mo.")}
          </span>
        </span>
        <ChevronDown
          className={cx(
            "size-5 shrink-0 text-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && plan.kind === "upgrade" ? (
        <div className="pp-fade border-t border-grape-100 p-4 text-sm">
          <p className="text-ink/85">
            {say(
              "Agency includes 20 price checks a month. Each one finds similar listings in the same area, or in nearby towns when there are few, and gives you a Sell fast, Market and Premium price with a link to every listing it used.",
              "May 20 price checks kada buwan ang Agency. Bawat isa, naghahanap ng mga katulad na listing sa parehong area, o sa mga kalapit na bayan kapag kaunti lang, at nagbibigay ng Sell fast, Market at Premium price na may link sa bawat listing na ginamit.",
            )}
          </p>
          {plan.canSeeBilling ? (
            <Link
              href="/app/billing"
              className={cx(buttonClass("primary"), "mt-3")}
            >
              See the Agency plan
            </Link>
          ) : null}
        </div>
      ) : null}

      {open && plan.kind === "ready" ? (
        <div className="pp-fade space-y-4 border-t border-grape-100 p-4">
          <p className="text-sm text-muted">
            {say("It uses the location and type you entered above, plus these details.", "Gagamitin nito ang location at type na nilagay mo sa taas, pati ang details na ito.")}
          </p>
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-5"
            onKeyDown={(e) => {
              // Enter here would save the property; run the check instead.
              if (
                e.key === "Enter" &&
                (e.target as HTMLElement).tagName === "INPUT"
              ) {
                e.preventDefault();
                run();
              }
            }}
          >
            <Field
              label="Floor area (sqm)"
              htmlFor={id("floor")}
              error={fieldErrors.floorArea}
            >
              <Input
                id={id("floor")}
                data-k="floorArea"
                inputMode="decimal"
                placeholder="120"
              />
            </Field>
            <Field
              label="Lot area (sqm)"
              htmlFor={id("lot")}
              error={fieldErrors.lotArea}
            >
              <Input
                id={id("lot")}
                data-k="lotArea"
                inputMode="decimal"
                placeholder="150"
              />
            </Field>
            <Field
              label="Bedrooms"
              htmlFor={id("beds")}
              error={fieldErrors.bedrooms}
            >
              <Input
                id={id("beds")}
                data-k="bedrooms"
                inputMode="numeric"
                placeholder="3"
              />
            </Field>
            <Field
              label="Bathrooms"
              htmlFor={id("baths")}
              error={fieldErrors.bathrooms}
            >
              <Input
                id={id("baths")}
                data-k="bathrooms"
                inputMode="numeric"
                placeholder="2"
              />
            </Field>
            <div className="col-span-2 sm:col-span-1">
              <Field
                label="Condition"
                htmlFor={id("cond")}
                error={fieldErrors.condition}
              >
                <Select id={id("cond")} data-k="condition" defaultValue="good">
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={run}
              disabled={pending || left === 0}
              className={buttonClass("primary")}
            >
              {pending
                ? say("Researching prices… up to a minute", "Nagre-research ng presyo… hanggang isang minuto")
                : report
                  ? "Check again"
                  : "Check the price"}
            </button>
            <span className="text-xs text-muted tabular-nums">
              {left === null
                ? say("Unlimited price checks on your plan.", "Unlimited ang price checks sa plan mo.")
                : left === 0
                  ? say("All price checks used this month. They renew on the 1st.", "Nagamit na lahat ng price checks ngayong buwan. Magre-renew sa a-uno.")
                  : say(`${left} of ${plan.limit} price checks left this month.`, `${left} sa ${plan.limit} price checks na lang ngayong buwan.`)}
            </span>
          </div>
          {picked !== null ? (
            <Alert tone="success">
              {say(
                "Put in the price field. You can still change it to any price you like before saving.",
                "Nailagay na sa price field. Pwede mo pa itong palitan ng kahit anong presyo bago mag-save.",
              )}
            </Alert>
          ) : null}
          {report ? (
            <PriceReport report={report} property={null} onPick={pick} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
