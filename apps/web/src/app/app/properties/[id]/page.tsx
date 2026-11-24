import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@propilot/shared";
import { Alert, buttonClass, Card, PageHeader, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getOrigin, getUser, requireBusiness } from "@/lib/auth";
import { centavosToPesosInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { deleteProperty, setPropertyStatus, updateProperty } from "../actions";
import { DeleteListing } from "./delete-listing";
import { isSuperAdmin } from "@/lib/superadmin";
import { PROPERTY_STATUSES } from "@propilot/shared";
import { STATUS_LABEL } from "@/lib/property-labels";
import { PropertyForm } from "../property-form";
import { RefreshSoon } from "@/components/refresh-soon";
import { PhotoManager, type Photo } from "./photo-manager";
import { FacebookPost, type FacebookPostLog } from "./facebook-post";
import { businessPages } from "@/lib/facebook-pages";
import { defaultCaption, type CaptionListing } from "@/lib/listing-caption";
import { canPublish, metaConfig } from "@/lib/meta";
import { aiEnabled, businessPlan } from "@/lib/plan";
import { buyerFinder, type ListingForMatch } from "@/lib/buyer-finder";
import { BuyerFinder, BuyerFinderUpgrade } from "./buyer-finder";
import { ShareListing } from "./share-listing";
import { loadOffers } from "@/lib/offers";
import { LowestPrice, Offers } from "../../offers";
import { publicListingPath } from "@/lib/public-listing";
import { siteOrigin } from "@/lib/site";
import { daysAgoIso } from "@/lib/time";

const STATUS_ACTION: Record<(typeof PROPERTY_STATUSES)[number], string> = {
  available: "Mark as available",
  reserved: "Mark as reserved",
  sold: "Mark as sold",
  archived: "Archive",
};

export default async function PropertyPage({ params, searchParams }: PageProps<"/app/properties/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [biz, user] = await Promise.all([requireBusiness(), getUser()]);
  const [aiOn, superAdmin] = await Promise.all([aiEnabled(biz.businessId), user ? isSuperAdmin(user.id) : Promise.resolve(false)]);
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

  // Buyer Finder (Basic): for people who work leads, on listings that are still for sale.
  const sales = can(biz.role, "lead.viewAll") || can(biz.role, "lead.viewAssigned");
  const plan = await businessPlan(biz.businessId);
  const finderOn = sales && aiOn && plan.homeFinderBuyers !== 0 && p.status === "available";
  const finder = finderOn
    ? await buyerFinder(supabase, { ...p, price_minor: Number(p.price_minor) } as ListingForMatch, plan.homeFinderBuyers)
    : null;

  // AI negotiation (Pro, Agency): the private lowest price (owners and admins) and the offers so far.
  const manager = biz.role === "owner" || biz.role === "admin";
  const [offers, { data: floorRow }] = await Promise.all([
    sales ? loadOffers(supabase, biz.businessId, { propertyId: p.id }) : Promise.resolve([]),
    manager ? supabase.from("listing_floors").select("min_price_minor, accept_price_minor").eq("property_id", p.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const lowestMinor = floorRow ? Number(floorRow.min_price_minor) : null;
  const acceptMinor = floorRow?.accept_price_minor == null ? null : Number(floorRow.accept_price_minor);

  // The public page: its link, and how it's doing over the last 30 days.
  const shareable = p.is_public && (p.status === "available" || p.status === "reserved");
  const [views, inquiries] = shareable
    ? await Promise.all([
        supabase
          .from("listing_views")
          .select("views")
          .eq("property_id", p.id)
          .gte("day", daysAgoIso(30).slice(0, 10))
          .then((r) => (r.data ?? []).reduce((n, v) => n + (v.views as number), 0)),
        supabase
          .from("viewing_requests")
          .select("id", { count: "exact", head: true })
          .eq("property_id", p.id)
          .gte("created_at", daysAgoIso(30))
          .then((r) => r.count ?? 0),
      ])
    : [0, 0];
  // Share the address search engines list (the production one), so shares and searches land on the same page.
  const publicUrl = `${siteOrigin() ?? (await getOrigin())}${publicListingPath(p.id)}`;

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
      <PageHeader
        title={p.name}
        description={p.location}
        action={
          canEdit && p.status !== "archived" ? (
            <Link href={`/app/pricing?property=${p.id}`} className={buttonClass("secondary")}>
              Check this price
            </Link>
          ) : null
        }
      />
      {sp.notice === "created" ? (
        <div className="mb-4">
          <Alert tone="success">Property saved. Add photos so buyers can see it.</Alert>
        </div>
      ) : sp.notice === "created-importing" ? (
        <div className="mb-4">
          <Alert tone="success">Property saved. The photos from your Facebook post are being added below.</Alert>
          <RefreshSoon />
        </div>
      ) : sp.notice === "status" ? (
        <div className="mb-4">
          <Alert tone="success">
            Status changed to {STATUS_LABEL[p.status as keyof typeof STATUS_LABEL] ?? p.status}.
            {p.status === "sold" || p.status === "archived" ? " Its public page is off and the assistant won't offer it. Nothing was deleted." : ""}
          </Alert>
        </div>
      ) : sp.notice === "not-deleted" ? (
        <div className="mb-4">
          <Alert>This listing couldn&apos;t be deleted. Only the app admin can delete listings.</Alert>
        </div>
      ) : sp.notice === "price-updated" ? (
        <div className="mb-4">
          <Alert tone="success">Asking price updated. Buyers and the AI chat see the new price now.</Alert>
        </div>
      ) : null}
      {shareable ? <ShareListing url={publicUrl} views={views} inquiries={inquiries} /> : null}
      <div className="mb-6">
        <PhotoManager
          businessId={biz.businessId}
          propertyId={p.id}
          photos={(photos ?? []) as Photo[]}
          canEdit={can(biz.role, "property.create")}
        />
      </div>
      <Card>
        {/* The key resets the form when the status is changed with the buttons further down. */}
        <PropertyForm key={p.status} action={updateProperty.bind(null, p.id)} initial={initial} submitLabel="Save changes" readOnly={!canEdit} aiWrite={aiOn} />
      </Card>

      {finder ? (
        <BuyerFinder propertyId={p.id} data={finder} />
      ) : sales && !aiOn && p.status === "available" ? (
        <BuyerFinderUpgrade canUpgrade={can(biz.role, "billing.manage")} />
      ) : null}

      {manager && plan.negotiation && p.status === "available" ? (
        <LowestPrice propertyId={p.id} askingMinor={Number(p.price_minor)} currentPesos={centavosToPesosInput(lowestMinor)} acceptPesos={centavosToPesosInput(acceptMinor)} />
      ) : manager && aiOn && !plan.negotiation && p.status === "available" ? (
        <Panel title="AI negotiation" className="mt-6">
          <p className="mt-1 max-w-2xl text-sm text-muted">
            On Pro and Agency, the AI negotiates price offers in the chat down to a lowest price you set privately, and closes deals at a price you pre-approve.{" "}
            <Link href="/app/billing" className="font-bold text-grape-700 hover:underline">
              See the plans
            </Link>
          </p>
        </Panel>
      ) : null}
      <Offers offers={offers} canDecide={manager} linkToChat title="Offers on this listing" />

      {showFacebook && fbPages.length && p.status !== "archived" && p.status !== "sold" ? (
        <FacebookPost
          propertyId={p.id}
          pages={fbPages.map((pg) => ({ id: pg.id, name: pg.name, canPost: canPublish(pg.tasks) }))}
          photoCount={photos?.length ?? 0}
          initialCaption={defaultCaption(p as CaptionListing)}
          history={fbHistory}
          aiAvailable={aiOn}
        />
      ) : null}

      {canEdit ? (
        <Panel title="Listing status" className="mt-6">
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Now <span className="font-semibold text-ink">{STATUS_LABEL[p.status as keyof typeof STATUS_LABEL] ?? p.status}</span>. When a property is sold or
            off the market, change its status. Sold and archived listings leave the public page and the assistant stops offering them, and all their records stay.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {PROPERTY_STATUSES.filter((s) => s !== p.status).map((s) => (
              <form key={s} action={setPropertyStatus.bind(null, p.id, s)}>
                <SubmitButton variant="secondary" pendingText="Saving…">
                  {STATUS_ACTION[s]}
                </SubmitButton>
              </form>
            ))}
          </div>
        </Panel>
      ) : null}

      {superAdmin ? <DeleteListing name={p.name} action={deleteProperty.bind(null, p.id)} /> : null}
    </>
  );
}
