"use server";

import { lowestDownPercent, type FinancingInfo, type FinancingKey, type FinancingTerms } from "@propilot/shared";
import type { Say } from "@/lib/lang";
import { appSay } from "@/lib/lang-server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { PROPERTY_STATUSES, can, propertySchema, sellerDeclarationSchema } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { pesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { copyPostPhotos } from "@/lib/post-photos";
import { MEDIA_BUCKET } from "@/lib/media";
import { publicListingPath } from "@/lib/public-listing";
import { isSuperAdmin } from "@/lib/superadmin";
import { checkFloor } from "@/lib/floor-rules";
import { businessPlan } from "@/lib/plan";
import { checkListing } from "@/lib/listing-check-jobs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORM_KEYS = [
  "name", "type", "location", "price", "reservationFee", "status", "description",
  "financingNotes", "lowestPrice", "acceptPrice",
  "bankDown", "bankRate", "bankYears", "pagibigDown", "pagibigRate", "pagibigYears",
  "inHouseDown", "inHouseRate", "inHouseYears", "inHouseDownMonths",
  "sellerCapacity", "sellerLicense",
] as const;

/** Form field names for each financing option's terms, and where each lands in the saved listing. */
const TERM_FORM = {
  bank: { flag: "bankFinancing", downPercent: "bankDown", ratePercent: "bankRate", years: "bankYears" },
  pagibig: { flag: "pagIbig", downPercent: "pagibigDown", ratePercent: "pagibigRate", years: "pagibigYears" },
  inHouse: { flag: "inHouse", downPercent: "inHouseDown", ratePercent: "inHouseRate", years: "inHouseYears", downMonths: "inHouseDownMonths" },
} as const;

function readForm(form: FormData) {
  const data = Object.fromEntries(FORM_KEYS.map((k) => [k, str(form, k)])) as Record<(typeof FORM_KEYS)[number], string>;
  const checks = { bankFinancing: form.get("bankFinancing") === "on", pagIbig: form.get("pagIbig") === "on", inHouse: form.get("inHouse") === "on" };
  return { data, checks };
}

/**
 * `declared` is the declaration already on the listing, if any: the box is
 * ticked once per declaration, so an edit that leaves it as it was doesn't ask again.
 */
function validate(form: FormData, say: Say, declared?: { capacity: string | null; license: string | null }) {
  const { data, checks } = readForm(form);
  const seller = sellerDeclarationSchema.safeParse({ capacity: data.sellerCapacity, license: data.sellerCapacity === "owner" ? undefined : data.sellerLicense || undefined });
  const sellerErrors: Record<string, string> = {};
  if (!seller.success) {
    if (seller.error.issues.some((i) => i.path[0] === "capacity")) sellerErrors.sellerCapacity = say("Choose how you're listing this property", "Piliin kung paano mo nili-list ang property na ito");
    else sellerErrors.sellerLicense = say("Enter the licence number: letters and numbers, at least 3", "Ilagay ang licence number: letters at numbers, hindi bababa sa 3");
  } else {
    const same = declared?.capacity === seller.data.capacity && (declared.license ?? null) === (seller.data.license ?? null);
    if (!same && form.get("sellerConfirm") !== "on") sellerErrors.sellerConfirm = say("Tick the box to confirm", "I-tick ang box para mag-confirm");
  }
  const price = pesosToCentavos(data.price);
  const reservation = pesosToCentavos(data.reservationFee);
  // Terms are kept only for the options that are ticked. An empty box means "not stated".
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const terms: FinancingInfo["terms"] = {};
  for (const [key, f] of Object.entries(TERM_FORM) as Array<[FinancingKey, (typeof TERM_FORM)[FinancingKey]]>) {
    if (!checks[f.flag]) continue;
    const one: FinancingTerms = { downPercent: num(data[f.downPercent]), ratePercent: num(data[f.ratePercent]), years: num(data[f.years]), downMonths: "downMonths" in f ? num(data[f.downMonths]) : undefined };
    if (Object.values(one).some((x) => x !== undefined)) terms[key] = one;
  }
  const dp = lowestDownPercent({ ...checks, terms });

  const parsed = propertySchema.safeParse({
    name: data.name,
    type: data.type,
    location: data.location,
    price: { amountMinor: price ?? undefined },
    reservationFee: reservation === null ? undefined : { amountMinor: reservation },
    status: data.status || "available",
    description: data.description || undefined,
    financing: { ...checks, downpaymentPercent: dp, notes: data.financingNotes || undefined, terms: Object.keys(terms).length ? terms : undefined },
  });
  if (!parsed.success || !seller.success || Object.keys(sellerErrors).length) {
    const fe: Record<string, string> = { ...(parsed.success ? {} : fieldErrorsFrom(parsed.error, say)), ...sellerErrors };
    // Map nested schema paths to the form's field names.
    if (fe["price.amountMinor"]) fe.price = say("Enter the price in pesos, e.g. 4500000", "Ilagay ang presyo sa pesos, hal. 4500000");
    if (fe["reservationFee.amountMinor"]) fe.reservationFee = say("Enter a peso amount, e.g. 25000", "Maglagay ng amount sa pesos, hal. 25000");
    for (const [key, f] of Object.entries(TERM_FORM)) {
      if (fe[`financing.terms.${key}.downPercent`]) fe[f.downPercent] = say("0 to 100", "0 hanggang 100");
      if (fe[`financing.terms.${key}.ratePercent`]) fe[f.ratePercent] = say("0 to 50", "0 hanggang 50");
      if (fe[`financing.terms.${key}.years`]) fe[f.years] = say("A whole number, 1 to 40", "Buong number, 1 hanggang 40");
      if ("downMonths" in f && fe[`financing.terms.${key}.downMonths`]) fe[f.downMonths] = say("A whole number, 1 to 60", "Buong number, 1 hanggang 60");
    }
    return { ok: false as const, state: { fieldErrors: fe, data: { ...data, ...flagData(checks), isPublic: form.get("isPublic") === "on" ? "on" : "", sellerConfirm: form.get("sellerConfirm") === "on" ? "on" : "" } } };
  }
  return { ok: true as const, value: parsed.data, seller: seller.data, isPublic: form.get("isPublic") === "on" };
}

function flagData(checks: Record<string, boolean>) {
  return Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v ? "on" : ""]));
}

function toRow(v: ReturnType<typeof propertySchema.parse>, seller: ReturnType<typeof sellerDeclarationSchema.parse>) {
  return {
    // The database stamps who declared and when.
    seller_capacity: seller.capacity,
    seller_license: seller.capacity === "owner" ? null : (seller.license ?? null),
    name: v.name,
    type: v.type,
    location: v.location,
    price_minor: v.price.amountMinor,
    currency: v.price.currency,
    reservation_fee_minor: v.reservationFee?.amountMinor ?? null,
    status: v.status,
    description: v.description ?? null,
    financing: v.financing ?? {},
  };
}

export async function createProperty(_prev: FormState, form: FormData): Promise<FormState> {
  const say = await appSay();
  const user = await requireUser();
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return { error: say("Your role can't add properties.", "Hindi pwedeng mag-add ng properties ang role mo.") };

  const result = validate(form, say);
  if (!result.ok) return result.state;

  // On plans where the AI negotiates, the owner or an admin sets its lowest price
  // with the listing (owner's decision, 27 Nov 2026). Agents can't see or set it;
  // the listing then waits for an owner or admin, flagged on the dashboard.
  const plan = await businessPlan(biz.businessId);
  const setsFloor = plan.negotiation && (biz.role === "owner" || biz.role === "admin");
  const floorCheck = setsFloor ? checkFloor(str(form, "lowestPrice"), str(form, "acceptPrice"), result.value.price.amountMinor, true) : null;
  if (floorCheck && !floorCheck.ok) {
    const { data, checks } = readForm(form);
    return { fieldErrors: { [floorCheck.field]: say(...floorCheck.message) }, data: { ...data, ...flagData(checks), isPublic: result.isPublic ? "on" : "", sellerConfirm: form.get("sellerConfirm") === "on" ? "on" : "" } };
  }

  const supabase = await createClient();
  // business_id comes from the server-side session, never from the form.
  const { data, error } = await supabase
    .from("properties")
    .insert({ ...toRow(result.value, result.seller), is_public: result.isPublic, business_id: biz.businessId, created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: say("Couldn't save the property. Please try again.", "Hindi na-save ang property. Paki-try ulit."), data: readForm(form).data };

  let floorSaved = true;
  if (floorCheck?.ok && floorCheck.floor) {
    const { error: floorError } = await supabase
      .from("listing_floors")
      .insert({ property_id: data.id, business_id: biz.businessId, min_price_minor: floorCheck.floor.minMinor, accept_price_minor: floorCheck.floor.acceptMinor });
    if (floorError) {
      console.error("[properties] lowest price not saved:", floorError.message);
      floorSaved = false;
    }
  }

  // Started from a connected Page's post: copy its photos once the page has responded.
  const ref = /^([0-9a-f-]{36}):(\d+_\d+)$/i.exec(str(form, "importPost"));
  if (ref) {
    const [, pageRowId, postId] = ref;
    after(() =>
      copyPostPhotos(biz.businessId, data.id, pageRowId!, postId!).catch((e) =>
        console.error("[meta] photo import failed:", e instanceof Error ? e.message : String(e)),
      ),
    );
  }

  // The app's own checks (wording, price) file a report for the app admin; they never block a save.
  after(() => checkListing(data.id));
  revalidatePath("/app/properties");
  redirect(`/app/properties/${data.id}?notice=${!floorSaved ? "created-no-floor" : ref ? "created-importing" : "created"}`);
}

export async function updateProperty(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const say = await appSay();
  const biz = await requireBusiness();
  if (!can(biz.role, "property.update")) return { error: say("Your role can't edit properties.", "Hindi pwedeng mag-edit ng properties ang role mo.") };

  if (!UUID.test(id)) return { error: say("You can't edit this property.", "Hindi mo pwedeng i-edit ang property na ito.") };
  const supabase = await createClient();
  const { data: current } = await supabase.from("properties").select("seller_capacity, seller_license").eq("id", id).eq("business_id", biz.businessId).maybeSingle();
  if (!current) return { error: say("You can't edit this property.", "Hindi mo pwedeng i-edit ang property na ito.") };
  const result = validate(form, say, { capacity: current.seller_capacity as string | null, license: current.seller_license as string | null });
  if (!result.ok) return result.state;

  const { data, error } = await supabase
    .from("properties")
    .update({ ...toRow(result.value, result.seller), is_public: result.isPublic, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .select("id");
  if (error) return { error: say("Couldn't save changes. Please try again.", "Hindi na-save ang changes. Paki-try ulit.") };
  if (!data?.length) return { error: say("You can't edit this property.", "Hindi mo pwedeng i-edit ang property na ito.") };

  after(() => checkListing(id));
  revalidatePath("/app/properties");
  revalidatePath(publicListingPath(id));
  return { ok: true, message: "Saved." };
}

/**
 * Change a listing's status (available, reserved, sold, archived). This is how
 * a listing is taken down: nothing is deleted, and its inquiries and history stay.
 * The database lets owners and admins change any listing, and agents the ones assigned to them.
 */
export async function setPropertyStatus(id: string, status: string): Promise<void> {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.update") || !UUID.test(id)) return;
  if (!(PROPERTY_STATUSES as readonly string[]).includes(status)) return;
  const supabase = await createClient();
  await supabase.from("properties").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", biz.businessId);
  revalidatePath("/app/properties");
  revalidatePath(publicListingPath(id));
  redirect(`/app/properties/${id}?notice=status`);
}

/**
 * Delete a listing for good, with its photos, inquiries, views and offers.
 * Only the app's own admin can (a super admin); the database enforces it too.
 * Everyone else changes the status instead.
 */
export async function deleteProperty(id: string): Promise<void> {
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!UUID.test(id) || !(await isSuperAdmin(user.id))) return;
  const supabase = await createClient();
  // The photo files to remove, read before the listing (and its photo records) are gone.
  const { data: media } = await supabase.from("property_media").select("storage_path, thumb_path").eq("property_id", id).eq("business_id", biz.businessId);
  const { data: gone } = await supabase.from("properties").delete().eq("id", id).eq("business_id", biz.businessId).select("id");
  if (!gone?.length) redirect(`/app/properties/${id}?notice=not-deleted`);
  const files = (media ?? []).flatMap((m) => [m.storage_path, m.thumb_path]).filter((f): f is string => Boolean(f));
  if (files.length) await supabase.storage.from(MEDIA_BUCKET).remove(files);
  revalidatePath("/app/properties");
  revalidatePath(publicListingPath(id));
  redirect("/app/properties?notice=deleted");
}
