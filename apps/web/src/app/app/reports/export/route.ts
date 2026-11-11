import { NextResponse, type NextRequest } from "next/server";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { loadReportData } from "@/lib/report-data";
import { leadsReport, listingReport, messengerReport, parseRange, teamReport } from "@/lib/reports";
import { leadsCsv, listingsCsv, messengerCsv, teamCsv } from "@/lib/reports-csv";

/** One report as a CSV for Excel or Google Sheets. */
export async function GET(request: NextRequest) {
  const biz = await requireBusiness();
  const p = request.nextUrl.searchParams;
  const report = p.get("report") ?? "";
  if (!can(biz.role, "analytics.view") || (report === "team" && !can(biz.role, "lead.viewAll"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!["leads", "listings", "messenger", "team"].includes(report)) return NextResponse.json({ error: "Unknown report" }, { status: 400 });

  const range = parseRange({ range: p.get("range") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined });
  const d = await loadReportData(biz.businessId, range);
  const csv =
    report === "leads"
      ? leadsCsv(leadsReport(d.vr, d.convs, range), range)
      : report === "listings"
        ? listingsCsv(listingReport(d.props, d.vr, d.convs, d.saves, d.questions, d.posts), range)
        : report === "messenger"
          ? messengerCsv(messengerReport(d.convs, d.msgs), range)
          : teamCsv(teamReport(d.members, d.props, d.vr, d.convs, d.msgs), range);

  const slug = biz.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "propilot";
  const period = range.key.replace(/[^a-z0-9-]+/gi, "-");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${report}-${period}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
