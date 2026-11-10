import Link from "next/link";
import { can } from "@propilot/shared";
import { Alert, Card, PageHeader, buttonClass } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const NOTICES: Record<string, string> = {
  welcome: "Your business is set up. Add your first property so the assistant has something to talk about.",
  "password-updated": "Your password has been updated.",
};

export default async function OverviewPage({ searchParams }: PageProps<"/app">) {
  const sp = await searchParams;
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const biz = await requireBusiness();
  const supabase = await createClient();

  const [properties, available, members] = await Promise.all([
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).neq("status", "archived"),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).eq("status", "available"),
    supabase.from("business_members").select("user_id", { count: "exact", head: true }).eq("business_id", biz.businessId).eq("status", "active"),
  ]);

  const stats = [
    { label: "Listings", value: properties.count ?? 0 },
    { label: "Available", value: available.count ?? 0 },
    { label: "Team members", value: members.count ?? 0 },
  ];

  return (
    <>
      <PageHeader title="Overview" description={biz.businessName} />
      {notice ? (
        <div className="mb-6">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-sm text-zinc-600">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      {(properties.count ?? 0) === 0 && can(biz.role, "property.create") ? (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Add your first property</p>
            <p className="text-sm text-zinc-600">The assistant answers buyers only from listings you add here.</p>
          </div>
          <Link href="/app/properties/new" className={buttonClass()}>
            Add property
          </Link>
        </Card>
      ) : null}

      <Card className="mt-6">
        <p className="font-medium">Coming next in the beta</p>
        <ul className="mt-2 space-y-1 text-sm text-zinc-600">
          <li>Connect your Facebook Page so the assistant can answer Messenger inquiries.</li>
          <li>Leads sorted into Hot, Warm and Cold, with a mobile alert for hot ones.</li>
          <li>Plans and billing (test mode only during the beta).</li>
        </ul>
      </Card>
    </>
  );
}
