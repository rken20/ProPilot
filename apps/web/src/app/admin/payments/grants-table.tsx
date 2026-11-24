import { SubmitButton } from "@/components/submit-button";

export type Grant = {
  id: string;
  email: string;
  months: number;
  note: string | null;
  created_at: string;
  claimed_at: string | null;
  cancelled_at: string | null;
  plans: { name: string } | null;
  businesses: { name: string } | null;
  payments: { period_end: string | null } | null;
};

const day = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** The plans given by email, newest first: which are on, which still wait for their tester, and a way to take a waiting one back. */
export function GrantsTable({
  grants,
  cancel,
}: {
  grants: Grant[];
  cancel: (id: string) => Promise<void>;
}) {
  if (!grants.length) return null;
  const waiting = grants.filter((g) => !g.claimed_at && !g.cancelled_at).length;
  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-ink">
        Plans given by email{waiting ? ` (${waiting} waiting)` : ""}
      </h3>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="pp-table w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Given</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="break-all">{g.email}</span>
                  {g.note ? (
                    <span className="block text-xs text-muted">{g.note}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {g.plans?.name}, {g.months} mo
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {day.format(new Date(g.created_at))}
                </td>
                <td className="px-4 py-3">
                  {g.claimed_at
                    ? `On for ${g.businesses?.name ?? "a business that was since removed"}${g.payments?.period_end ? `, until ${day.format(new Date(g.payments.period_end))}` : ""}`
                    : g.cancelled_at
                      ? "Cancelled"
                      : "Waiting for them to sign up and set up a business"}
                </td>
                <td className="px-4 py-3 text-right">
                  {!g.claimed_at && !g.cancelled_at ? (
                    <form action={cancel.bind(null, g.id)}>
                      <SubmitButton
                        variant="ghost"
                        pendingText="…"
                        aria-label={`Cancel the plan waiting for ${g.email}`}
                      >
                        Cancel
                      </SubmitButton>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
