import type { Report, ReportedListing, TakenDown } from "@/lib/admin-reports";
import { groupReports } from "@/lib/admin-reports";
import { requireSuperAdmin } from "@/lib/superadmin";
import { AdminTabs } from "../admin-tabs";
import { dismissReport, restoreListing, takeDown } from "./actions";
import { ReportsView } from "./reports-view";

export const metadata = { title: "Reports · MyHomeSeller admin" };

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

/** MyHomeSeller super admins only: listings people reported or the app's own checks flagged, and what to do about each. */
export default async function AdminReportsPage({
  searchParams,
}: PageProps<"/admin/reports">) {
  const { admin } = await requireSuperAdmin();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : undefined;

  const [{ data: open, error }, { data: down }] = await Promise.all([
    admin
      .from("listing_reports")
      .select(
        "id, source, reason, details, reporter_contact, created_at, properties(id, name, location, price_minor, currency, is_public, status, seller_capacity, seller_license), businesses(name, restricted_at, seller_verifications(verified_at))",
      )
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("properties")
      .select("id, name, taken_down_at, taken_down_reason, businesses(name)")
      .not("taken_down_at", "is", null)
      .order("taken_down_at", { ascending: false })
      .limit(100),
  ]);
  if (error) console.error("[admin] reports failed:", error.message);

  type P = {
    id: string;
    name: string;
    location: string;
    price_minor: number;
    currency: string | null;
    is_public: boolean;
    status: string;
    seller_capacity: string | null;
    seller_license: string | null;
  };
  type B = {
    name: string;
    restricted_at: string | null;
    seller_verifications: unknown;
  };
  const rows = (open ?? []).flatMap((r) => {
    const p = one(r.properties as unknown as P | P[] | null);
    const b = one(r.businesses as unknown as B | B[] | null);
    if (!p) return [];
    const v = b?.seller_verifications;
    const listing: Omit<ReportedListing, "reports"> = {
      id: p.id,
      name: p.name,
      location: p.location,
      price_minor: Number(p.price_minor),
      currency: p.currency ?? "PHP",
      live:
        p.is_public &&
        (p.status === "available" || p.status === "reserved") &&
        !b?.restricted_at,
      seller: b?.name ?? "Unknown seller",
      verified: Array.isArray(v) ? v.length > 0 : Boolean(v),
      capacity: p.seller_capacity,
      license: p.seller_license,
    };
    const report: Report = {
      id: r.id as string,
      source: r.source as Report["source"],
      reason: r.reason as string,
      details: (r.details as string | null) ?? null,
      contact: (r.reporter_contact as string | null) ?? null,
      created_at: r.created_at as string,
    };
    return [{ ...report, listing }];
  });
  const takenDown: TakenDown[] = (down ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    seller:
      one(
        p.businesses as unknown as
          { name: string } | Array<{ name: string }> | null,
      )?.name ?? "Unknown seller",
    reason: (p.taken_down_reason as string | null) ?? "",
    at: p.taken_down_at as string,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <AdminTabs current="/admin/reports" />
      <ReportsView
        listings={groupReports(rows)}
        takenDown={takenDown}
        notice={notice}
        actions={{ takeDown, dismissReport, restoreListing }}
      />
    </main>
  );
}
