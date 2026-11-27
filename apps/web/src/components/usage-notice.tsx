import type { Say } from "@/lib/lang";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import {
  CREDIT_KEYS,
  nextPlan,
  usageSentence,
  type UsageItem,
} from "@/lib/usage-rules";

/** Shown when an AI allowance on the plan is at 80% or used up. Renders nothing otherwise. */
export function UsageNotice({
  items,
  planCode,
  canSeeBilling,
  onBilling = false,
  className,
  say,
  credits = 0,
}: {
  /** AI credits left; they carry AI replies and Ask MyHomeSeller past the allowance. */
  credits?: number;
  /** Taglish or English, the business's choice. */
  say: Say;
  items: UsageItem[];
  planCode: string;
  canSeeBilling: boolean;
  /** On the Billing page itself the plans are right below, so there's no button. */
  onBilling?: boolean;
  className?: string;
}) {
  // What is used up comes first.
  const flagged = items.filter((i) => i.level !== "ok").sort((a, b) => Number(b.level === "out") - Number(a.level === "out"));
  if (!flagged.length) return null;
  // A used-up reply or Ask allowance isn't a stop while credits are left.
  const stopped = (i: UsageItem) =>
    i.level === "out" && !(credits > 0 && CREDIT_KEYS.includes(i.key));
  const out = flagged.some(stopped);
  const onCredits = !out && flagged.some((i) => i.level === "out");
  const creditsHelp = flagged.some((i) => CREDIT_KEYS.includes(i.key));
  const up = nextPlan(planCode);
  return (
    <section
      role="status"
      aria-label="AI allowance"
      className={cx("flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[1.5rem] border p-4 sm:p-5", out ? "border-hot/30 bg-hot-50" : "border-brass-700/25 bg-tile-lemon", className)}
    >
      <TriangleAlert className={cx("size-6 shrink-0", out ? "text-hot" : "text-brass-700")} aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <h2 className="text-[15px] font-extrabold tracking-tight">
          {out
            ? say(
                "An AI allowance is used up",
                "Ubos na ang isang AI allowance",
              )
            : onCredits
              ? say("Your AI credits are in use", "Gamit na ang AI credits mo")
              : say(
                  "An AI allowance is running low",
                  "Paubos na ang isang AI allowance",
                )}
        </h2>
        <ul className="mt-1 space-y-0.5 text-sm text-ink/85 tabular-nums">
          {flagged.map((i) => (
            <li key={i.key}>{usageSentence(i, say, credits)}</li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-ink/70">
          {say(
            "Allowances renew on the 1st.",
            "Nagre-renew ang allowances tuwing a-uno.",
          )}
          {creditsHelp && !onBilling
            ? canSeeBilling
              ? say(
                  " AI credits keep AI replies and Ask MyHomeSeller going.",
                  " Tuloy ang AI replies at Ask MyHomeSeller gamit ang AI credits.",
                )
              : say(
                  " The owner can buy AI credits in Billing.",
                  " Pwedeng bumili ang owner ng AI credits sa Billing.",
                )
            : ""}
          {up
            ? onBilling
              ? say(` ${up.name} includes more: see the plans below.`, ` Mas marami sa ${up.name}: tingnan ang plans sa baba.`)
              : canSeeBilling
                ? say(` ${up.name} includes more.`, ` Mas marami sa ${up.name}.`)
                : say(` ${up.name} includes more. Ask the owner about upgrading.`, ` Mas marami sa ${up.name}. Itanong sa owner ang pag-upgrade.`)
            : ""}
        </p>
      </div>
      {canSeeBilling && !onBilling ? (
        <div className="flex flex-wrap gap-2">
          {creditsHelp ? (
            <Link
              href="/app/billing#credits"
              className={buttonClass(up ? "secondary" : "primary")}
            >
              {say("Buy AI credits", "Bumili ng AI credits")}
            </Link>
          ) : null}
          {up ? (
            <Link href="/app/billing" className={buttonClass("primary")}>
              Upgrade to {up.name}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const LEVEL_TEXT = { ok: "", low: "Running low", out: "Used up" } as const;

/** Every allowance on the plan with how much is used, for Billing. */
export function UsageMeters({ items }: { items: UsageItem[] }) {
  if (!items.length) return null;
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => {
        const pct = Math.min(100, Math.round((i.used / i.limit) * 100));
        return (
          <div key={i.key}>
            <dt className="flex items-baseline justify-between gap-2 text-sm font-semibold">
              {
                {
                  replies: "AI replies",
                  ask: "Ask MyHomeSeller",
                  finder: "Buyer Finder buyers",
                  priceChecks: "Price checks",
                  videoAds: "Video ads",
                }[i.key]
              }
              {i.level !== "ok" ? (
                <span
                  className={cx(
                    "text-xs font-bold",
                    i.level === "out" ? "text-hot" : "text-brass-700",
                  )}
                >
                  {LEVEL_TEXT[i.level]}
                </span>
              ) : null}
            </dt>
            <dd className="mt-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-grape-50" role="img" aria-label={`${pct}% used`}>
                <div className={cx("h-full rounded-full", i.level === "out" ? "bg-hot" : i.level === "low" ? "bg-[var(--chart-messenger)]" : "bg-grape-500")} style={{ width: `${Math.max(pct, i.used ? 2 : 0)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted tabular-nums">
                {i.used.toLocaleString("en-PH")} of {i.limit.toLocaleString("en-PH")} used this month
              </p>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
