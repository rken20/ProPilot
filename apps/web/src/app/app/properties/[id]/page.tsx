import { sayIn } from "@/lib/lang";
import { businessLang } from "@/lib/lang-server";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
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
import { floorProblem } from "@/lib/floor-rules";
import { buyerFinder, type ListingForMatch } from "@/lib/buyer-finder";
import { BuyerFinder, BuyerFinderUpgrade } from "./buyer-finder";
import { ShareListing } from "./share-listing";
import { loadOffers } from "@/lib/offers";
import { LowestPrice, Offers } from "../../offers";
import { publicListingPath } from "@/lib/public-listing";
import { siteOrigin } from "@/lib/site";
import { daysAgoIso } from "@/lib/time";
import { sellerVerified, supportEmail } from "@/lib/seller-verified";

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
  const say = sayIn(await businessLang(biz.businessId));
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
  const floorIssue = manager && plan.negotiation ? floorProblem(p.status, lowestMinor, Number(p.price_minor)) : null;
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
    ...termValues(financing),
    financingNotes: typeof financing.notes === "string" ? financing.notes : "",
    bankFinancing: financing.bankFinancing ? "on" : "",
    pagIbig: financing.pagIbig ? "on" : "",
    inHouse: financing.inHouse ? "on" : "",
    isPublic: p.is_public ? "on" : "",
    mapPin: (p.map_query as string | null) ?? "",
    sellerCapacity: (p.seller_capacity as string | null) ?? "",
    sellerLicense: (p.seller_license as string | null) ?? "",
    // Set once a declaration is made: the form then asks for the box again only if it changes.
    declaredOn: p.declared_at ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(new Date(p.declared_at as string)) : "",
  };
  const takenDown = Boolean(p.taken_down_at);
  const verified = shareable ? await sellerVerified(biz.businessId) : false;
  const support = supportEmail();

  // Owners/admins edit any listing; agents only listings assigned to them (RLS enforces the same).
  const canEdit =
    can(biz.role, "property.create") || (can(biz.role, "property.update") && p.assigned_agent_id === user?.id);

  return (
    <>
      <Link href="/app/properties" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Properties
      </Link>
      <PageHeader icon3d="house" tone="sky"
        title={p.name}
        description={p.location}
        action={
          canEdit && p.status !== "archived" ? (
            <div className="flex flex-wrap gap-2">
              {p.status !== "sold" ? (
                <Link href={`/app/video?property=${p.id}`} className={buttonClass("secondary")}>
                  Make a video ad
                </Link>
              ) : null}
              <Link href={`/app/pricing?property=${p.id}`} className={buttonClass("secondary")}>
                Check this price
              </Link>
            </div>
          ) : null
        }
      />
      {takenDown ? (
        <div className="mb-4">
          <Alert>
            <span className="font-semibold">{say("MyHomeSeller took this listing's public page down.", "Tinanggal ng MyHomeSeller ang public page ng listing na ito.")}</span>{" "}
            {say("Reason:", "Dahilan:")} {p.taken_down_reason as string}{" "}
            {support
              ? say(`If this is a mistake, email ${support}.`, `Kung mali ito, mag-email sa ${support}.`)
              : say("If this is a mistake, contact MyHomeSeller.", "Kung mali ito, kontakin ang MyHomeSeller.")}
          </Alert>
        </div>
      ) : null}
      {floorIssue ? (
        <div className="mb-4">
          <Alert>
            {floorIssue === "missing"
              ? say(
                  "Set the lowest price you'd accept for this listing. Until you do, the AI can't negotiate and passes every price offer to your team.",
                  "I-set ang lowest price na tatanggapin mo para sa listing na ito. Hangga't wala pa, hindi makakapag-negotiate ang AI at ipapasa nito sa team mo ang bawat price offer.",
                )
              : say(
                  "Your lowest price is above the new asking price. The AI is holding at the asking price until you set a new lowest price.",
                  "Mas mataas ang lowest price mo sa bagong asking price. Sa asking price muna hihinto ang AI hanggang mag-set ka ng bagong lowest price.",
                )}{" "}
            <a href="#ai-negotiation" className="font-semibold underline underline-offset-2">
              {say("Set it now", "I-set na ngayon")}
            </a>
          </Alert>
        </div>
      ) : null}
      {sp.notice === "created-no-floor" ? (
        <div className="mb-4">
          <Alert>
            {say(
              "Property saved, but the lowest price for the AI wasn't. Please set it again below.",
              "Na-save ang property, pero hindi na-save ang lowest price para sa AI. Paki-set ulit sa baba.",
            )}
          </Alert>
        </div>
      ) : sp.notice === "created" ? (
        <div className="mb-4">
          <Alert tone="success">{say("Property saved. Add photos so buyers can see it.", "Na-save na ang property. Mag-add ng photos para makita ito ng mga buyer.")}</Alert>
        </div>
      ) : sp.notice === "created-importing" ? (
        <div className="mb-4">
          <Alert tone="success">{say("Property saved. The photos from your Facebook post are being added below.", "Na-save na ang property. Ina-add na sa baba ang photos mula sa Facebook post mo.")}</Alert>
          <RefreshSoon />
        </div>
      ) : sp.notice === "status" ? (
        <div className="mb-4">
          <Alert tone="success">
            {say("Status changed to", "Napalitan na ang status:")} {STATUS_LABEL[p.status as keyof typeof STATUS_LABEL] ?? p.status}.
            {p.status === "sold" || p.status === "archived"
              ? say(" Its public page is off and the assistant won't offer it. Nothing was deleted.", " Naka-off na ang public page nito at hindi na ito io-offer ng assistant. Walang na-delete.")
              : ""}
          </Alert>
        </div>
      ) : sp.notice === "not-deleted" ? (
        <div className="mb-4">
          <Alert>{say("This listing couldn't be deleted. Only the app admin can delete listings.", "Hindi na-delete ang listing na ito. App admin lang ang pwedeng mag-delete ng listings.")}</Alert>
        </div>
      ) : sp.notice === "price-updated" ? (
        <div className="mb-4">
          <Alert tone="success">{say("Asking price updated. Buyers and the AI chat see the new price now.", "Na-update na ang asking price. Ang bagong presyo na ang makikita ng buyers at ng AI chat.")}</Alert>
        </div>
      ) : null}
      {shareable ? <ShareListing url={publicUrl} views={views} inquiries={inquiries} /> : null}
      {shareable ? (
        <p className="-mt-2 mb-6 flex items-start gap-2 rounded-2xl bg-tile-sky/60 p-4 text-sm text-ink/80">
          <ShieldCheck className={`mt-0.5 size-4 shrink-0 ${verified ? "text-brand-600" : "text-muted"}`} aria-hidden />
          <span>
            {verified
              ? say("Verified seller: buyers see this mark on your public pages.", "Verified seller: nakikita ng buyers ang mark na ito sa public pages mo.")
              : say(
                  "Your public pages say “Not yet verified”. MyHomeSeller verifies a seller by checking an ID or licence with you directly; nothing is uploaded here.",
                  "“Not yet verified” ang nakalagay sa public pages mo. Vine-verify ng MyHomeSeller ang seller sa pag-check ng ID o licence nang direkta sa'yo; walang ina-upload dito.",
                )}
            {!verified && support ? (
              <>
                {" "}
                {say("To ask, email", "Para mag-request, mag-email sa")}{" "}
                <a href={`mailto:${support}`} className="font-semibold text-grape-700 underline underline-offset-2">
                  {support}
                </a>
                .
              </>
            ) : null}
          </span>
        </p>
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
        {/* The key resets the form when the status is changed with the buttons further down. */}
        <PropertyForm key={`${p.status}:${initial.declaredOn}:${initial.sellerCapacity}:${initial.sellerLicense}:${initial.mapPin}`} action={updateProperty.bind(null, p.id)} initial={initial} submitLabel="Save changes" readOnly={!canEdit} aiWrite={aiOn} publicOff={takenDown} />
      </Card>

      {finder ? (
        <BuyerFinder propertyId={p.id} data={finder} />
      ) : sales && !aiOn && p.status === "available" ? (
        <BuyerFinderUpgrade canUpgrade={can(biz.role, "billing.manage")} />
      ) : null}

      {manager && plan.negotiation && p.status === "available" ? (
        <div id="ai-negotiation" className="scroll-mt-24">
          <LowestPrice propertyId={p.id} askingMinor={Number(p.price_minor)} currentPesos={centavosToPesosInput(lowestMinor)} acceptPesos={centavosToPesosInput(acceptMinor)} />
        </div>
      ) : manager && aiOn && !plan.negotiation && p.status === "available" ? (
        <Panel icon3d="robot" title="AI negotiation" className="mt-6">
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {say(
              "On Pro and Agency, the AI negotiates price offers in the chat down to a lowest price you set privately, and closes deals at a price you pre-approve.",
              "Sa Pro at Agency, ang AI ang nakikipag-negotiate ng presyo sa chat hanggang sa lowest price na ikaw lang ang nakakaalam, at nagko-close ng deal sa presyong pre-approved mo.",
            )}{" "}
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
        <Panel icon3d="clipboard" title="Listing status" className="mt-6">
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {say("Now", "Ngayon:")} <span className="font-semibold text-ink">{STATUS_LABEL[p.status as keyof typeof STATUS_LABEL] ?? p.status}</span>.{" "}
            {say(
              "When a property is sold or off the market, change its status. Sold and archived listings leave the public page and the assistant stops offering them, and all their records stay.",
              "Kapag sold na o wala na sa market ang property, palitan ang status nito. Mawawala sa public page ang sold at archived listings at hindi na ito io-offer ng assistant, pero mananatili ang lahat ng records.",
            )}
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

/** The saved financing terms as the form's field values. An option without its own downpayment shows the listing's general one. */
function termValues(financing: Record<string, unknown>): Record<string, string> {
  const terms = (financing.terms ?? {}) as Partial<Record<string, Record<string, number | undefined>>>;
  const text = (n: number | undefined) => (n === undefined ? "" : String(n));
  const general = typeof financing.downpaymentPercent === "number" ? financing.downpaymentPercent : undefined;
  const out: Record<string, string> = {};
  for (const [key, prefix] of [["bank", "bank"], ["pagibig", "pagibig"], ["inHouse", "inHouse"]] as const) {
    const t = terms[key] ?? {};
    out[`${prefix}Down`] = text(t.downPercent ?? general);
    out[`${prefix}Rate`] = text(t.ratePercent);
    out[`${prefix}Years`] = text(t.years);
  }
  out.inHouseDownMonths = text(terms.inHouse?.downMonths);
  return out;
}
