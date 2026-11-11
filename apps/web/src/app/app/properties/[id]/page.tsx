import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@propilot/shared";
import { Alert, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getUser, requireBusiness } from "@/lib/auth";
import { centavosToPesosInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { archiveProperty, updateProperty } from "../actions";
import { PropertyForm } from "../property-form";
import { RefreshSoon } from "@/components/refresh-soon";
import { PhotoManager, type Photo } from "./photo-manager";
import { FacebookPost, type FacebookPostLog } from "./facebook-post";
import { businessPages } from "@/lib/facebook-pages";
import { defaultCaption, type CaptionListing } from "@/lib/listing-caption";
import { canPublish, metaConfig } from "@/lib/meta";

export default async function PropertyPage({ params, searchParams }: PageProps<"/app/properties/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [biz, user] = await Promise.all([requireBusiness(), getUser()]);
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  if (!p) notFound();

  const { data: photos } = await supabase
    .from("property_media")
    .select("id, storage_path, thumb_path")
    .eq("property_id", p.id)
    .eq("kind", "photo")
    .order("sort_order")
    .order("created_at");

  const showFacebook = Boolean(metaConfig()) && can(biz.role, "content.publish");
  const [fbPages, fbHistory] = showFacebook
    ? await Promise.all([
        businessPages(biz.businessId),
        supabase
          .from("facebook_posts")
          .select("id, page_name, status, kind, permalink_url, error, created_at")
          .eq("property_id", p.id)
          .order("created_at", { ascending: false })
          .limit(5)
          .then((r) => (r.data ?? []) as FacebookPostLog[]),
      ])
    : [[], []];

  const financing = (p.financing ?? {}) as Record<string, unknown>;
  const initial = {
    name: p.name,
    type: p.type,
    status: p.status,
    location: p.location,
    price: centavosToPesosInput(p.price_minor),
    reservationFee: centavosToPesosInput(p.reservation_fee_minor),
    description: p.description ?? "",
    downpaymentPercent: financing.downpaymentPercent === undefined ? "" : String(financing.downpaymentPercent),
    financingNotes: typeof financing.notes === "string" ? financing.notes : "",
    bankFinancing: financing.bankFinancing ? "on" : "",
    pagIbig: financing.pagIbig ? "on" : "",
    inHouse: financing.inHouse ? "on" : "",
    isPublic: p.is_public ? "on" : "",
  };

  // Owners/admins edit any listing; agents only listings assigned to them (RLS enforces the same).
  const canEdit =
    can(biz.role, "property.create") || (can(biz.role, "property.update") && p.assigned_agent_id === user?.id);

  return (
    <>
      <Link href="/app/properties" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Properties
      </Link>
      <PageHeader title={p.name} description={p.location} />
      {sp.notice === "created" ? (
        <div className="mb-4">
          <Alert tone="success">Property saved. Add photos so buyers can see it.</Alert>
        </div>
      ) : sp.notice === "created-importing" ? (
        <div className="mb-4">
          <Alert tone="success">Property saved. The photos from your Facebook post are being added below.</Alert>
          <RefreshSoon />
        </div>
      ) : null}
      <div className="mb-6">
        <PhotoManager
          businessId={biz.businessId}
          propertyId={p.id}
          photos={(photos ?? []) as Photo[]}
          canEdit={can(biz.role, "property.create")}
        />
      </div>
      <Card>
        <PropertyForm action={updateProperty.bind(null, p.id)} initial={initial} submitLabel="Save changes" readOnly={!canEdit} />
      </Card>

      {showFacebook && fbPages.length && p.status !== "archived" && p.status !== "sold" ? (
        <FacebookPost
          propertyId={p.id}
          pages={fbPages.map((pg) => ({ id: pg.id, name: pg.name, canPost: canPublish(pg.tasks) }))}
          photoCount={photos?.length ?? 0}
          initialCaption={defaultCaption(p as CaptionListing)}
          history={fbHistory}
          aiAvailable={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      ) : null}

      {can(biz.role, "property.delete") && p.status !== "archived" ? (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Archive this property</p>
            <p className="text-sm text-zinc-600">It stays in your records but the assistant stops offering it.</p>
          </div>
          <form action={archiveProperty.bind(null, p.id)}>
            <SubmitButton variant="danger" pendingText="Archiving…">
              Archive
            </SubmitButton>
          </form>
        </Card>
      ) : null}
    </>
  );
}
