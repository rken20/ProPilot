import Link from "next/link";
import { can } from "@propilot/shared";
import { Alert, Badge, Card, PageHeader, buttonClass } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, TYPE_LABEL } from "./property-form";

export default async function PropertiesPage({ searchParams }: PageProps<"/app/properties">) {
  const sp = await searchParams;
  const showArchived = sp.show === "archived";
  const biz = await requireBusiness();
  const supabase = await createClient();

  let query = supabase
    .from("properties")
    .select("id, name, type, location, price_minor, currency, status, updated_at")
    .eq("business_id", biz.businessId)
    .order("updated_at", { ascending: false });
  query = showArchived ? query.eq("status", "archived") : query.neq("status", "archived");
  const { data: rows, error } = await query;

  return (
    <>
      <PageHeader
        title="Properties"
        description="The assistant answers buyers only from what's listed here."
        action={
          can(biz.role, "property.create") ? (
            <Link href="/app/properties/new" className={buttonClass()}>
              Add property
            </Link>
          ) : null
        }
      />
      {sp.notice === "archived" ? (
        <div className="mb-4">
          <Alert tone="success">Property archived. The assistant won&apos;t mention it to buyers.</Alert>
        </div>
      ) : null}
      {error ? <Alert>Couldn&apos;t load properties. Refresh to try again.</Alert> : null}

      <div className="mb-3 flex gap-4 text-sm">
        <Link href="/app/properties" className={showArchived ? "text-zinc-500" : "font-medium text-brand-700"}>
          Active
        </Link>
        <Link href="/app/properties?show=archived" className={showArchived ? "font-medium text-brand-700" : "text-zinc-500"}>
          Archived
        </Link>
      </div>

      {rows && rows.length === 0 ? (
        <Card className="text-center">
          <p className="font-medium">{showArchived ? "No archived properties" : "No properties yet"}</p>
          {!showArchived ? <p className="mt-1 text-sm text-zinc-600">Add a listing with its price, location and financing.</p> : null}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Type</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows?.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/app/properties/${p.id}`} className="font-medium text-zinc-900 hover:text-brand-700">
                      {p.name}
                    </Link>
                    <p className="text-xs text-zinc-500">{p.location}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-600 sm:table-cell">{TYPE_LABEL[p.type as keyof typeof TYPE_LABEL]}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.price_minor, p.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={p.status === "available" ? "brand" : "neutral"}>
                      {STATUS_LABEL[p.status as keyof typeof STATUS_LABEL]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
