import { Check, Clock, X } from "lucide-react";
import { Alert, Card, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatPeso } from "@/lib/money";
import { buyerPlan } from "@/lib/plan";
import { BUYER_PLAN_COPY, daysLeft, FREE_PLAN } from "@/lib/plan-rules";
import { createClient } from "@/lib/supabase/server";
import { GcashPayForm } from "@/app/app/billing/pay-form";
import { submitBuyerPayment } from "./actions";

const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
const date = (iso: string) => dateFmt.format(new Date(iso));

const STATUS = {
  pending: { label: "Being checked", icon: Clock, tone: "text-[#7d5f26]" },
  confirmed: { label: "Confirmed", icon: Check, tone: "text-good" },
  rejected: { label: "Not found", icon: X, tone: "text-hot" },
} as const;

/** The buyer's own plan: Free, or Basic for the buyer-side AI. */
export default async function BuyerPlanPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [plan, { data: plans }, { data: payments }] = await Promise.all([
    buyerPlan(user.id),
    supabase.from("plans").select("id, code, name, price_minor").eq("is_active", true).order("sort_order"),
    supabase
      .from("payments")
      .select("id, months, amount_minor, method, reference, status, reject_reason, period_end, created_at")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(24),
  ]);
  const left = daysLeft(plan.periodEnd, new Date());
  const pending = (payments ?? []).find((p) => p.status === "pending");
  const lastRejected = (payments ?? [])[0]?.status === "rejected" ? payments![0] : null;
  const paid = (plans ?? []).filter((p) => p.code !== FREE_PLAN);
  const gcashNumber = process.env.GCASH_NUMBER ?? "";
  const gcashName = process.env.GCASH_NAME ?? "";

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-[2.25rem] leading-tight font-medium">My plan</h1>
      <p className="mt-2 text-muted">
        {plan.periodEnd
          ? `You're on ${plan.name} until ${date(plan.periodEnd)} (${left} day${left === 1 ? "" : "s"} left).`
          : "You're on Free. Upgrade to Basic for AI answers, AI search of other sites and instant AI replies from agents."}
      </p>

      {pending ? (
        <div className="mt-6">
          <Alert tone="success">We&apos;re checking your GCash payment (reference {pending.reference}). This usually takes up to a day.</Alert>
        </div>
      ) : lastRejected ? (
        <div className="mt-6">
          <Alert>
            We couldn&apos;t find your GCash payment with reference {lastRejected.reference}.{lastRejected.reject_reason ? ` ${lastRejected.reject_reason}` : ""} Check
            the number on your receipt and send it again below.
          </Alert>
        </div>
      ) : null}

      <div className="mt-7 grid gap-5 md:grid-cols-2">
        {(plans ?? []).map((p) => {
          const copy = BUYER_PLAN_COPY[p.code as string];
          const current = p.code === plan.code;
          return (
            <section key={p.id} className={cx("rounded-2xl border bg-white p-6 shadow-[var(--shadow-card)]", current ? "border-brand-600" : "border-line")}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold tracking-tight text-brand-700">{p.name}</h2>
                {current ? <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">Your plan</span> : null}
              </div>
              <p className="mt-2">
                <span className="text-3xl font-bold tabular-nums">{p.price_minor ? formatPeso(p.price_minor as number) : "₱0"}</span>
                <span className="text-muted"> / month</span>
              </p>
              {copy ? (
                <>
                  <p className="mt-3 font-semibold">{copy.tagline}</p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {copy.includes.map((line) => (
                      <li key={line} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden /> {line}
                      </li>
                    ))}
                  </ul>
                  {copy.excludes ? <p className="mt-4 text-sm text-muted">{copy.excludes}</p> : null}
                </>
              ) : null}
            </section>
          );
        })}
      </div>

      {paid.length ? (
        <Card className="mt-6">
          <h2 className="text-lg font-bold tracking-tight">{plan.code === FREE_PLAN ? `Upgrade to ${paid[0]!.name}` : `Renew ${plan.name}`}</h2>
          <p className="mt-1 mb-5 text-sm text-muted">
            {plan.code === FREE_PLAN ? "Pay by GCash. Your plan starts when we confirm the payment." : "Renewing early adds the months to the end of your current plan."}
          </p>
          {!gcashNumber || !gcashName ? (
            <p className="text-sm text-muted">GCash payments aren&apos;t set up yet. Please check back soon.</p>
          ) : pending ? (
            <p className="text-sm text-muted">You can pay again once we&apos;ve checked your current payment.</p>
          ) : (
            <GcashPayForm
              action={submitBuyerPayment}
              plan={{ code: paid[0]!.code as string, name: paid[0]!.name as string }}
              priceMinor={paid[0]!.price_minor as number}
              gcashNumber={gcashNumber}
              gcashName={gcashName}
            />
          )}
        </Card>
      ) : null}

      {payments?.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold tracking-tight">Payment history</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white text-sm">
            {payments.map((p) => {
              const s = STATUS[p.status as keyof typeof STATUS];
              const Icon = s.icon;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    {date(p.created_at as string)} · {p.months} mo · {p.method === "complimentary" ? "Free" : formatPeso(p.amount_minor as number)}
                    {p.reference ? <span className="text-muted"> · ref {p.reference}</span> : null}
                  </span>
                  <span className={cx("inline-flex items-center gap-1.5 font-medium", s.tone)}>
                    <Icon className="size-4" aria-hidden /> {s.label}
                    {p.status === "confirmed" && p.period_end ? <span className="font-normal text-muted"> · until {date(p.period_end as string)}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
