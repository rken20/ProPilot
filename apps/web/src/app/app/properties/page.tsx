import { appSay } from "@/lib/lang-server";
import Link from "next/link";
import { can } from "@propilot/shared";
import { Alert, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCoverThumbs } from "@/lib/listings";
import { mediaUrl } from "@/lib/media";
import { PropertiesList } from "./properties-list";

export default async function PropertiesPage({ searchParams }: PageProps<"/app/properties">) {
  const sp = await searchParams;
  const say = await appSay();
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
      <PageHeader icon3d="houses" tone="sky"
        title="Properties"
        description={say("The assistant answers buyers only from what's listed here.", "Ang nakalista lang dito ang ginagamit ng assistant sa pagsagot sa mga buyer.")}
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
          <Alert tone="success">
            {say("Property archived. Its public page is off and the assistant won't mention it.", "Na-archive na ang property. Naka-off na ang public page nito at hindi na ito babanggitin ng assistant.")}
          </Alert>
        </div>
      ) : sp.notice === "deleted" ? (
        <div className="mb-4">
          <Alert tone="success">
            {say("Listing deleted for good, with its photos and public page.", "Na-delete na nang tuluyan ang listing, kasama ang photos at public page nito.")}
          </Alert>
        </div>
      ) : null}
      {error ? <Alert>{say("Couldn't load properties. Refresh to try again.", "Hindi na-load ang properties. I-refresh para subukan ulit.")}</Alert> : null}

      <div className="mb-3 flex gap-4 text-sm">
        <Link href="/app/properties" className={showArchived ? "text-zinc-500" : "font-medium text-brand-700"}>
          Active
        </Link>
        <Link href="/app/properties?show=archived" className={showArchived ? "font-medium text-brand-700" : "text-zinc-500"}>
          Archived
        </Link>
      </div>

      {rows && rows.length === 0 ? (
        <EmptyState icon="houses" tone="sky" title={showArchived ? "No archived properties" : "No properties yet"}>
          {!showArchived ? say("Add a listing with its price, location and financing.", "Mag-add ng listing kasama ang presyo, location at financing nito.") : null}
        </EmptyState>
      ) : (
        <PropertiesList rows={(rows ?? []).map((r) => ({ ...r, coverUrl: mediaUrl(covers.get(r.id)) ?? null }))} />
      )}
    </>
  );
}
