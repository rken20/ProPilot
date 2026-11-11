import { NextResponse } from "next/server";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { SHEET_HEADER, leadRow, toCsv, type Lead } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

/** All of this business's leads as a CSV that opens in Google Sheets or Excel. */
export async function GET() {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.viewAll") && !can(biz.role, "lead.viewAssigned")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("viewing_requests")
    .select("id, property_id, buyer_name, buyer_phone, preferred_date, budget_note, message, status, agent_note, scheduled_at, created_at")
    .eq("business_id", biz.businessId)
    .order("created_at", { ascending: false })
    .limit(5000);
  const ids = [...new Set((leads ?? []).map((l) => l.property_id))];
  const { data: props } = ids.length
    ? await supabase.from("properties").select("id, name").eq("business_id", biz.businessId).in("id", ids)
    : { data: [] };
  const names = new Map((props ?? []).map((p) => [p.id, p.name as string]));
  const csv = toCsv([[...SHEET_HEADER], ...(leads ?? []).map((l) => leadRow(l as Lead, names.get(l.property_id) ?? ""))]);

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const slug = biz.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "leads";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-leads-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
