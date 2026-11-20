import Link from "next/link";
import { can } from "@propilot/shared";
import { Alert, Card, PageHeader, buttonClass } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCoverThumbs } from "@/lib/listings";
import { mediaUrl } from "@/lib/media";
import { PropertiesList } from "./properties-list";

export default async function PropertiesPage({ searchParams }: PageProps<"/app/properties">) {
  const sp = await searchParams;
  const showArchived = sp.show === "archived";
  const biz = await requireBusiness();
  const supabase = await createClient();

  let query = supabase
    .from("properties")
    .select("id, name, type, location, price_minor, currency, status, is_public, updated_at")
    .eq("business_id", biz.businessId)
    .order("updated_at", { ascending: false });
  query = showArchived ? query.eq("status", "archived") : query.neq("status", "archived");
  const { data: rows, error } = await query;
  const covers = await getCoverThumbs((rows ?? []).map((r) => r.id));

  return (
    <>
      <PageHeader
        title="Properties"
        description="The assistant answers buyers only from what's listed here."
        action={
          <div className="flex flex-wrap gap-2">
            {can(biz.role, "property.update") ? (
              <Link href="/app/pricing" className={buttonClass("secondary")}>
                Pricing Advisor
              </Link>
            ) : null}
            {can(biz.role, "property.create") ? (
              <Link href="/app/properties/new" className={buttonClass()}>
                Add property
              </Link>
            ) : null}
          </div>
        }
      />
      {sp.notice === "archived" ? (
        <div className="mb-4">
          <Alert tone="success">Property archived. Its public page is off and the assistant won&apos;t mention it.</Alert>
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
        <PropertiesList rows={(rows ?? []).map((r) => ({ ...r, coverUrl: mediaUrl(covers.get(r.id)) ?? null }))} />
      )}
    </>
  );
}
