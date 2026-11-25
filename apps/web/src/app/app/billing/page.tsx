import { sayIn } from "@/lib/lang";
import { appLang } from "@/lib/lang-server";
import { redirect } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
import { can } from "@propilot/shared";
import { Alert, Card, cx, PageHeader, Panel } from "@/components/ui";
import { getUser, requireBusiness } from "@/lib/auth";
import { formatPeso } from "@/lib/money";
import { businessPlan } from "@/lib/plan";
import { daysLeft, FREE_PLAN, planCopy } from "@/lib/plan-rules";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";

/** How each plan's card looks. */
const PLAN_LOOK: Record<string, { icon: Icon3dName; tile: string; badge?: string }> = {
  free: { icon: "key", tile: "bg-white" },
  basic: { icon: "house", tile: "bg-tile-mint", badge: "For owners" },
  pro: { icon: "rocket", tile: "bg-tile-lavender", badge: "For agents" },
  agency: { icon: "trophy", tile: "bg-tile-peach", badge: "For teams" },
};
import { createClient } from "@/lib/supabase/server";
import { GcashPayForm } from "./pay-form";
import { UsageMeters, UsageNotice } from "@/components/usage-notice";
import { businessUsage } from "@/lib/usage";
import { SubmitButton } from "@/components/submit-button";
import { isSuperAdmin } from "@/lib/superadmin";
import { switchTestPlan } from "./test-plan-actions";

const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
const date = (iso: string) => dateFmt.format(new Date(iso));

const STATUS = {
  pending: { label: "Being checked", icon: Clock, tone: "text-brass-700" },
  confirmed: { label: "Confirmed", icon: Check, tone: "text-good" },
  rejected: { label: "Not found", icon: X, tone: "text-hot" },
} as const;

export default async function BillingPage() {
  const lang = await appLang();
  const say = sayIn(lang);
  const biz = await requireBusiness();
  if (!can(biz.role, "billing.view")) redirect("/app");
  const supabase = await createClient();
  const [plan, { data: plans }, { data: payments }] = await Promise.all([
    businessPlan(biz.businessId),
    supabase.from("plans").select("id, code, name, price_minor").eq("is_active", true).order("sort_order"),
    supabase
      .from("payments")
      .select("id, plan_id, months, amount_minor, method, reference, status, reject_reason, period_end, created_at")
      .eq("business_id", biz.businessId)
      .order("created_at", { ascending: false })
      .limit(24),
  ]);

  const usage = await businessUsage(supabase, biz.businessId, plan);
  const me = await getUser();
  const superAdmin = me ? await isSuperAdmin(me.id) : false;
  const now = new Date();
  const left = daysLeft(plan.periodEnd, now);
  const pending = (payments ?? []).find((p) => p.status === "pending");
  const lastRejected = (payments ?? [])[0]?.status === "rejected" ? payments![0] : null;
  const canPay = can(biz.role, "billing.manage");
  const gcashNumber = process.env.GCASH_NUMBER ?? "";
  const gcashName = process.env.GCASH_NAME ?? "";
  const planName = new Map((plans ?? []).map((p) => [p.id, p.name as string]));
  const paid = (plans ?? []).filter((p) => p.code !== FREE_PLAN);

  return (
    <>
      <PageHeader title="Billing" description={say("Your plan, and paying by GCash.", "Ang plan mo, at pagbayad via GCash.")} />

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Current plan</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight">{plan.name}</p>
          <p className="mt-1 text-sm text-muted">
            {plan.periodEnd
              ? say(
                  `Paid until ${date(plan.periodEnd)} (${left} day${left === 1 ? "" : "s"} left). After that you're back on Free unless you renew.`,
                  `Bayad hanggang ${date(plan.periodEnd)} (${left} araw na lang). Pagkatapos noon, balik ka sa Free maliban kung mag-renew ka.`,
                )
              : say("Free forever. Upgrade any time to turn on the AI features.", "Free habambuhay. Mag-upgrade kahit kailan para ma-on ang AI features.")}
          </p>
        </div>
        {plan.periodEnd && left !== null && left <= 5 ? (
          <span className="rounded-full bg-hot px-3 py-1 text-sm font-semibold text-white">Renew soon</span>
        ) : null}
      </Card>

      {superAdmin ? (
        <Panel title="Test a plan" className="mb-6 border-dashed border-grape-300">
          <p className="mt-0.5 text-sm text-muted">
            {say(
              `Only super admins see this. It puts ${biz.businessName} on any plan straight away, with no payment, so you can try each plan's features. A paid plan is set for one year from today.`,
              `Super admins lang ang nakakakita nito. Agad nitong inilalagay ang ${biz.businessName} sa kahit anong plan, walang bayad, para masubukan mo ang features ng bawat plan. Isang taon mula ngayon ang paid plan.`,
            )}
          </p>
          <form action={switchTestPlan} className="mt-4 flex flex-wrap gap-2">
            {[{ code: FREE_PLAN, name: "Free" }, ...paid.map((p) => ({ code: p.code as string, name: p.name as string }))].map((p) => (
              <SubmitButton key={p.code} name="plan" value={p.code} variant={p.code === plan.code ? "primary" : "secondary"} pendingText="Switching…" aria-pressed={p.code === plan.code}>
                {p.name}
                {p.code === plan.code ? " (now)" : ""}
              </SubmitButton>
            ))}
          </form>
        </Panel>
      ) : null}

      <UsageNotice items={usage} planCode={plan.code} canSeeBilling onBilling className="mb-6" say={say} />
      {usage.length ? (
        <Panel title="AI allowances this month" className="mb-6">
          <p className="mt-0.5 mb-4 text-sm text-muted">{say("They renew on the 1st of each month.", "Nagre-renew ang mga ito tuwing a-uno ng buwan.")}</p>
          <UsageMeters items={usage} />
        </Panel>
      ) : null}

      {pending ? (
        <div className="mb-6">
          <Alert tone="success">
            We&apos;re checking your GCash payment (reference {pending.reference}). This usually takes up to a day, and we&apos;ll email you when your
            plan is on.
          </Alert>
        </div>
      ) : lastRejected ? (
        <div className="mb-6">
          <Alert>
            {say(`We couldn't find your GCash payment with reference ${lastRejected.reference}.`, `Hindi namin nahanap ang GCash payment mo na may reference ${lastRejected.reference}.`)}
            {lastRejected.reject_reason ? ` ${lastRejected.reject_reason}` : ""}{" "}
            {say("Check the number on your receipt and send it again below.", "I-check ang number sa resibo mo at i-send ulit sa baba.")}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {(plans ?? []).map((p) => {
          const copy = planCopy(lang)[p.code as string];
          const current = p.code === plan.code;
          const look = PLAN_LOOK[p.code as string] ?? PLAN_LOOK.free!;
          return (
            <section
              key={p.id}
              className={cx("pp-bounce rounded-[1.5rem] border-2 p-6 shadow-[var(--shadow-card)]", look.tile, current ? "border-brand-600" : "border-transparent")}
            >
              <div className="flex items-start justify-between gap-3">
                <Icon3d name={look.icon} size={48} />
                {current ? (
                  <span className="rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">Your plan</span>
                ) : look.badge ? (
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-grape-700">{look.badge}</span>
                ) : null}
              </div>
              <h2 className="mt-3 text-xl font-extrabold tracking-tight">{p.name}</h2>
              <p className="mt-1">
                <span className="text-3xl font-extrabold tabular-nums">{p.price_minor ? formatPeso(p.price_minor as number) : "₱0"}</span>
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
        <Panel title={plan.code === FREE_PLAN ? "Upgrade" : "Renew or change your plan"} className="mt-6">
          <p className="mt-1 mb-5 text-sm text-muted">
            {plan.code === FREE_PLAN
              ? say("Pay by GCash. Your plan starts when we confirm the payment.", "Magbayad via GCash. Magsisimula ang plan mo kapag na-confirm na namin ang bayad.")
              : say(
                  "Renewing the same plan early adds the months to the end. Switching plans starts the new plan when we confirm the payment.",
                  "Kapag nag-renew ka nang maaga sa parehong plan, idadagdag ang months sa dulo. Kapag nagpalit ka ng plan, magsisimula ang bago kapag na-confirm na namin ang bayad.",
                )}
          </p>
          {!canPay ? (
            <p className="text-sm text-muted">{say("Only the business owner can pay for a plan.", "Business owner lang ang pwedeng magbayad ng plan.")}</p>
          ) : !gcashNumber || !gcashName ? (
            <p className="text-sm text-muted">{say("GCash payments aren't set up yet. Please check back soon.", "Hindi pa naka-set up ang GCash payments. Paki-check ulit soon.")}</p>
          ) : pending ? (
            <p className="text-sm text-muted">{say("You can pay again once we've checked your current payment.", "Pwede ka ulit magbayad kapag na-check na namin ang kasalukuyan mong payment.")}</p>
          ) : (
            <GcashPayForm
              plans={paid.map((x) => ({ code: x.code as string, name: x.name as string, priceMinor: x.price_minor as number }))}
              defaultCode={plan.code === FREE_PLAN ? undefined : plan.code} gcashNumber={gcashNumber} gcashName={gcashName} />
          )}
        </Panel>
      ) : null}

      {payments?.length ? (
        <section className="mt-8" aria-labelledby="history">
          <h2 id="history" className="mb-3 text-lg font-bold tracking-tight">
            Payment history
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">GCash reference</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const s = STATUS[p.status as keyof typeof STATUS];
                  const Icon = s.icon;
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">{date(p.created_at as string)}</td>
                      <td className="px-4 py-3">
                        {planName.get(p.plan_id) ?? "Plan"}, {p.months} mo
                      </td>
                      <td className="px-4 py-3 tabular-nums">{p.method === "complimentary" ? "Free" : formatPeso(p.amount_minor as number)}</td>
                      <td className="px-4 py-3 tabular-nums">{p.reference ?? "—"}</td>
                      <td className={cx("px-4 py-3 font-medium", s.tone)}>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="size-4" aria-hidden /> {s.label}
                          {p.status === "confirmed" && p.period_end ? <span className="font-normal text-muted"> · until {date(p.period_end as string)}</span> : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
