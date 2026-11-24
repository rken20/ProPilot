import { Card, PageHeader, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPeso } from "@/lib/money";
import { requireSuperAdmin } from "@/lib/superadmin";
import { AdminTabs } from "../admin-tabs";
import { cancelGrant, confirmPayment, grantByEmail, grantPlan, rejectPayment } from "./actions";
import { GrantByEmail } from "./grant-by-email";
import { GrantsTable, type Grant } from "./grants-table";

export const metadata = { title: "Payments · MyHomeSeller admin" };

const when = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

type Row = {
  id: string;
  business_id: string | null;
  months: number;
  amount_minor: number;
  method: string;
  reference: string | null;
  payer_name: string | null;
  status: string;
  reject_reason: string | null;
  period_end: string | null;
  created_at: string;
  plans: { name: string } | null;
  businesses: { name: string } | null;
};

/** MyHomeSeller super admins only: check GCash payments and turn plans on. */
export default async function AdminPaymentsPage() {
  const { admin } = await requireSuperAdmin();
  // A tester may have signed up since the plan was given: turn on any that can be now.
  await admin.rpc("claim_plan_grants").then(({ error }) => error && console.error("[billing] claim grants failed:", error.message));
  const cols = "id, business_id, months, amount_minor, method, reference, payer_name, status, reject_reason, period_end, created_at, plans(name), businesses(name)";
  const [{ data: pending }, { data: recent }, { data: businesses }, { data: plans }, { data: subs }, { data: grantRows }] = await Promise.all([
    admin.from("payments").select(cols).eq("status", "pending").order("created_at").limit(100),
    admin.from("payments").select(cols).neq("status", "pending").order("created_at", { ascending: false }).limit(30),
    admin.from("businesses").select("id, name").order("name").limit(1000),
    admin.from("plans").select("code, name, price_minor").eq("is_active", true).neq("price_minor", 0).order("sort_order"),
    admin.from("subscriptions").select("business_id, current_period_end, plans(name)"),
    admin
      .from("plan_grants")
      .select("id, email, months, note, created_at, claimed_at, cancelled_at, plans(name), businesses(name), payments(period_end)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const grants = (grantRows ?? []) as unknown as Grant[];
  const payer = (p: Row) => p.businesses?.name ?? "Business";
  const subOf = new Map((subs ?? []).map((s) => [s.business_id as string, s]));
  const rows = (pending ?? []) as unknown as Row[];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <AdminTabs current="/admin/payments" />
      <PageHeader
        title="Payments to check"
        description="Find each payment in your GCash transaction history by its reference number and amount, then confirm it. Confirming turns the plan on right away."
      />

      {rows.length ? (
        <ul className="space-y-4">
          {rows.map((p) => (
            <li key={p.id}>
              <Card className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold tracking-tight">{payer(p)}</p>
                    <p className="text-sm text-muted">
                      {p.plans?.name}, {p.months} month{p.months === 1 ? "" : "s"} · sent {when.format(new Date(p.created_at))}
                    </p>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted">Amount</dt>
                    <dd className="font-semibold tabular-nums">{formatPeso(p.amount_minor)}</dd>
                    <dt className="text-muted">Reference</dt>
                    <dd className="font-semibold tabular-nums">{p.reference}</dd>
                    <dt className="text-muted">Paid from</dt>
                    <dd className="font-semibold">{p.payer_name}</dd>
                  </dl>
                </div>
                <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
                  <form action={confirmPayment.bind(null, p.id)}>
                    <SubmitButton pendingText="Confirming…">Found it, confirm</SubmitButton>
                  </form>
                  <form action={rejectPayment.bind(null, p.id)} className="flex flex-1 flex-wrap items-end gap-2">
                    <label className="min-w-56 flex-1 text-xs font-medium text-muted">
                      Note to the owner (optional)
                      <input
                        name="reason"
                        maxLength={300}
                        placeholder="e.g. The amount received was ₱450, not ₱499."
                        className="mt-1 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                      />
                    </label>
                    <SubmitButton variant="secondary" pendingText="…">
                      Not found
                    </SubmitButton>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <p className="font-semibold">No payments waiting.</p>
          <p className="mt-1 text-sm text-muted">You&apos;ll get an email when an owner sends GCash payment details.</p>
        </Card>
      )}

      <Panel title="Give a plan to beta testers" className="mt-8">
        <p className="mt-1 mb-4 text-sm text-muted">
          Type the email each tester signs in with. If they already have a business here, the plan is on at once. If they haven&apos;t signed up yet, it
          turns on by itself when they sign up with that email and set up their business. The months start counting when the plan turns on.
        </p>
        <GrantByEmail plans={(plans ?? []).map((p) => ({ code: p.code as string, name: p.name as string }))} give={grantByEmail} />

        <GrantsTable grants={grants} cancel={cancelGrant} />
      </Panel>

      <Panel title="Give a plan to a business" className="mt-8">
        <p className="mt-1 mb-4 text-sm text-muted">
          Pick a business that is already here. It works like a confirmed payment of ₱0 and shows in their payment history.
        </p>
        <form action={grantPlan} className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-xs font-medium text-muted">
            Business
            <select name="target" required className="mt-1 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-ink">
              <optgroup label="Businesses">
                {(businesses ?? []).map((b) => {
                  const s = subOf.get(b.id as string);
                  const active = s && new Date(s.current_period_end as string) > new Date();
                  return (
                    <option key={b.id} value={`b:${b.id}`}>
                      {b.name}
                      {active ? ` (${(s!.plans as unknown as { name: string } | null)?.name} until ${day.format(new Date(s!.current_period_end as string))})` : " (Free)"}
                    </option>
                  );
                })}
              </optgroup>
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Plan
            <select name="plan" className="mt-1 block rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-ink">
              {(plans ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Months
            <select name="months" defaultValue="3" className="mt-1 block rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-ink">
              {[1, 3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton variant="secondary" pendingText="Giving…">
            Give plan
          </SubmitButton>
        </form>
      </Panel>

      {recent?.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold tracking-tight">Recently checked</h2>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {(recent as unknown as Row[]).map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">{payer(p)}</td>
                    <td className="px-4 py-3">
                      {p.plans?.name}, {p.months} mo
                    </td>
                    <td className="px-4 py-3 tabular-nums">{p.method === "complimentary" ? "Free (given)" : formatPeso(p.amount_minor)}</td>
                    <td className="px-4 py-3 tabular-nums">{p.reference ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.status === "confirmed" ? `Confirmed, until ${p.period_end ? day.format(new Date(p.period_end)) : "—"}` : `Not found${p.reject_reason ? `: ${p.reject_reason}` : ""}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
