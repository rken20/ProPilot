import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, CalendarDays, CalendarPlus, Download, Phone } from "lucide-react";
import { can } from "@propilot/shared";
import { PageHeader, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import { googleCalendarUrl, isoToManilaInput, manilaDateTime, prettyDate } from "@/lib/leads";
import { updateLead } from "./actions";

const STATUS = {
  new: { label: "New", tone: "bg-orange-50 text-hot" },
  contacted: { label: "Contacted", tone: "bg-violet-50 text-violet-700" },
  scheduled: { label: "Viewing scheduled", tone: "bg-emerald-50 text-good" },
  completed: { label: "Viewed", tone: "bg-slate-100 text-slate-600" },
  closed: { label: "Closed", tone: "bg-slate-100 text-slate-500" },
} as const;
type Status = keyof typeof STATUS;

const FILTERS: Array<[string, string]> = [
  ["open", "Open"],
  ["new", "New"],
  ["scheduled", "Scheduled"],
  ["all", "All"],
];

export default async function LeadsPage({ searchParams }: PageProps<"/app/leads">) {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.viewAll") && !can(biz.role, "lead.viewAssigned")) redirect("/app");
  const sp = await searchParams;
  const filter = typeof sp.show === "string" && FILTERS.some(([k]) => k === sp.show) ? sp.show : "open";

  const supabase = await createClient();
  let query = supabase
    .from("viewing_requests")
    .select("id, property_id, buyer_name, buyer_phone, preferred_date, budget_note, message, status, agent_note, scheduled_at, calendar_event_id, created_at")
    .eq("business_id", biz.businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter === "open") query = query.in("status", ["new", "contacted", "scheduled"]);
  else if (filter !== "all") query = query.eq("status", filter);
  const { data: leads } = await query;

  const propIds = [...new Set((leads ?? []).map((l) => l.property_id))];
  const { data: props } = propIds.length
    ? await supabase.from("properties").select("id, name, location").in("id", propIds)
    : { data: [] };
  const propById = new Map((props ?? []).map((p) => [p.id, p as { id: string; name: string; location: string }]));
  const propName = new Map((props ?? []).map((p) => [p.id, p.name]));
  const { data: integ } = await supabase
    .from("business_integrations")
    .select("spreadsheet_url, sheets_synced_at")
    .eq("business_id", biz.businessId)
    .maybeSingle();
  const canUpdate = can(biz.role, "lead.update");

  return (
    <>
      <PageHeader
        title="Buyer leads"
        description="Viewing requests from buyers on ProPilot. Call or text them to confirm."
        action={
          <div className="flex flex-wrap gap-2">
            {integ?.spreadsheet_url ? (
              <a href={integ.spreadsheet_url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                Open Google Sheet
              </a>
            ) : null}
            <a href="/app/leads/export" className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> Export CSV
            </a>
          </div>
        }
      />

      <nav className="mb-4 flex gap-1" aria-label="Filter leads">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={k === "open" ? "/app/leads" : `/app/leads?show=${k}`}
            aria-current={filter === k ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-1.5 text-sm",
              filter === k ? "bg-white font-semibold text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {!leads?.length ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <CalendarDays className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-3 font-semibold">{filter === "open" ? "No open leads" : "Nothing here"}</p>
          <p className="mt-1 text-sm text-muted">
            Turn on <span className="font-medium text-ink">Show to ProPilot buyers</span> on a property so buyers can find it
            and request viewings.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {leads.map((l) => {
            const s = STATUS[l.status as Status] ?? STATUS.new;
            return (
              <li key={l.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{l.buyer_name}</p>
                    <p className="text-sm text-muted">
                      wants to view{" "}
                      <Link href={`/app/properties/${l.property_id}`} className="font-medium text-ink hover:text-brand-700">
                        {propName.get(l.property_id) ?? "a property"}
                      </Link>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", s.tone)}>{s.label}</span>
                    <span className="text-xs text-muted">{timeAgo(l.created_at)}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <a href={`tel:${l.buyer_phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700">
                    <Phone className="size-4" aria-hidden /> {l.buyer_phone}
                  </a>
                  <span className="flex items-center gap-1.5 text-muted">
                    <CalendarDays className="size-4" aria-hidden />
                    {l.preferred_date ? `Prefers ${prettyDate(l.preferred_date)}` : "No preferred date"}
                  </span>
                  {l.scheduled_at ? (
                    <span className="flex items-center gap-1.5 font-medium text-good">
                      <CalendarCheck className="size-4" aria-hidden /> Viewing {manilaDateTime(l.scheduled_at)}
                      {l.calendar_event_id ? <span className="font-normal text-muted">(in Google Calendar)</span> : null}
                    </span>
                  ) : null}
                  {l.budget_note ? <span className="text-muted">Budget: {l.budget_note}</span> : null}
                </div>
                {l.message ? <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm">{l.message}</p> : null}
                {propById.get(l.property_id) && !l.calendar_event_id ? (
                  <a
                    href={googleCalendarUrl(l, propById.get(l.property_id)!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    <CalendarPlus className="size-4" aria-hidden /> Add to Google Calendar
                  </a>
                ) : null}

                {canUpdate ? (
                  <form action={updateLead.bind(null, l.id)} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                    <label className="text-xs font-medium text-muted">
                      Status
                      <select
                        name="status"
                        defaultValue={l.status}
                        className="mt-1 block rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink"
                      >
                        {(Object.keys(STATUS) as Status[]).map((k) => (
                          <option key={k} value={k}>
                            {STATUS[k].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-muted">
                      Viewing time (PH)
                      <input
                        type="datetime-local"
                        name="scheduledAt"
                        defaultValue={isoToManilaInput(l.scheduled_at)}
                        className="mt-1 block rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink"
                      />
                    </label>
                    <label className="min-w-48 flex-1 text-xs font-medium text-muted">
                      Private note
                      <input
                        name="agentNote"
                        defaultValue={l.agent_note ?? ""}
                        maxLength={1000}
                        placeholder="e.g. Confirmed Sat 10am"
                        className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
                      />
                    </label>
                    <SubmitButton variant="secondary" pendingText="Saving…">
                      Save
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
