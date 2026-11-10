import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getListing } from "@/lib/listings";
import { createClient } from "@/lib/supabase/server";
import { cancelViewing } from "../actions";

const STATUS: Record<string, { label: string; tone: string }> = {
  new: { label: "Sent to agent", tone: "bg-brand-50 text-brand-700" },
  contacted: { label: "Agent contacted you", tone: "bg-violet-50 text-violet-700" },
  scheduled: { label: "Viewing scheduled", tone: "bg-emerald-50 text-good" },
  completed: { label: "Viewed", tone: "bg-slate-100 text-slate-600" },
  closed: { label: "Closed", tone: "bg-slate-100 text-slate-500" },
};

export default async function MyViewingsPage() {
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("viewing_requests")
    .select("id, property_id, preferred_date, status, created_at")
    .order("created_at", { ascending: false });
  const listings = await Promise.all((requests ?? []).map((r) => getListing(r.property_id)));

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">My viewings</h1>
      <p className="mt-1 text-muted">Requests you&apos;ve sent. Agents usually reply by phone.</p>

      {!requests?.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <CalendarDays className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-3 font-semibold">No viewing requests yet</p>
          <p className="mt-1 text-sm text-muted">Open a listing and choose Request a viewing.</p>
          <Link href="/buyer" className={buttonClass("primary", "mt-5")}>
            Browse listings
          </Link>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {requests.map((r, i) => {
            const l = listings[i];
            const s = STATUS[r.status] ?? STATUS.new!;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  {l ? (
                    <Link href={`/buyer/listings/${l.id}`} className="font-semibold hover:text-brand-700">
                      {l.name}
                    </Link>
                  ) : (
                    <p className="font-semibold text-muted">Listing no longer available</p>
                  )}
                  <p className="text-sm text-muted">
                    {l ? `${l.business_name}, ` : ""}
                    {r.preferred_date
                      ? `preferred ${new Date(r.preferred_date + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
                      : "no preferred date"}
                  </p>
                </div>
                <span className={cx("rounded-full px-2.5 py-1 text-xs font-medium", s.tone)}>{s.label}</span>
                {r.status === "new" || r.status === "contacted" ? (
                  <form action={cancelViewing.bind(null, r.id)}>
                    <SubmitButton variant="ghost" className="px-2 py-1 text-sm" pendingText="…">
                      Cancel
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
