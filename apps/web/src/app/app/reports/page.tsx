import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { businessPages } from "@/lib/facebook-pages";
import { loadReportData } from "@/lib/report-data";
import { inRange, leadsReport, listingReport, messengerReport, parseRange, teamReport } from "@/lib/reports";
import { ReportsView } from "./reports-view";

export default async function ReportsPage({ searchParams }: PageProps<"/app/reports">) {
  const sp = await searchParams;
  const biz = await requireBusiness();
  if (!can(biz.role, "analytics.view")) redirect("/app");

  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const range = parseRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to) });
  const [d, pages] = await Promise.all([loadReportData(biz.businessId, range), businessPages(biz.businessId)]);
  const convsInRange = d.convs.filter((c) => inRange(c.created_at, range));

  return (
    <ReportsView
      range={range}
      leads={leadsReport(d.vr, convsInRange, range)}
      listings={listingReport(d.props, d.vr, convsInRange, d.saves, d.questions, d.posts)}
      messenger={messengerReport(convsInRange, d.msgs)}
      messengerOn={pages.some((p) => p.messenger_enabled) || d.convs.length > 0}
      team={can(biz.role, "lead.viewAll") ? teamReport(d.members, d.props, d.vr, d.convs, d.msgs) : null}
    />
  );
}
