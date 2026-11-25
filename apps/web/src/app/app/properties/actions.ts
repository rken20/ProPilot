"use server";

import type { Say } from "@/lib/lang";
import { appSay } from "@/lib/lang-server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { PROPERTY_STATUSES, can, propertySchema } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { pesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { copyPostPhotos } from "@/lib/post-photos";
import { MEDIA_BUCKET } from "@/lib/media";
import { publicListingPath } from "@/lib/public-listing";
import { isSuperAdmin } from "@/lib/superadmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORM_KEYS = [
  "name", "type", "location", "price", "reservationFee", "status", "description",
  "downpaymentPercent", "financingNotes",
] as const;

function readForm(form: FormData) {
  const data = Object.fromEntries(FORM_KEYS.map((k) => [k, str(form, k)])) as Record<(typeof FORM_KEYS)[number], string>;
  const checks = { bankFinancing: form.get("bankFinancing") === "on", pagIbig: form.get("pagIbig") === "on", inHouse: form.get("inHouse") === "on" };
  return { data, checks };
}

function validate(form: FormData, say: Say) {
  const { data, checks } = readForm(form);
  const price = pesosToCentavos(data.price);
  const reservation = pesosToCentavos(data.reservationFee);
  const dp = data.downpaymentPercent.trim() === "" ? undefined : Number(data.downpaymentPercent);

  const parsed = propertySchema.safeParse({
    name: data.name,
    type: data.type,
    location: data.location,
    price: { amountMinor: price ?? undefined },
    reservationFee: reservation === null ? undefined : { amountMinor: reservation },
    status: data.status || "available",
    description: data.description || undefined,
    financing: { ...checks, downpaymentPercent: dp, notes: data.financingNotes || undefined },
  });
  if (!parsed.success) {
    const fe = fieldErrorsFrom(parsed.error, say);
    // Map nested schema paths to the form's field names.
    if (fe["price.amountMinor"]) fe.price = say("Enter the price in pesos, e.g. 4500000", "Ilagay ang presyo sa pesos, hal. 4500000");
    if (fe["reservationFee.amountMinor"]) fe.reservationFee = say("Enter a peso amount, e.g. 25000", "Maglagay ng amount sa pesos, hal. 25000");
    if (fe["financing.downpaymentPercent"]) fe.downpaymentPercent = say("Enter a percentage from 0 to 100", "Maglagay ng percentage mula 0 hanggang 100");
    return { ok: false as const, state: { fieldErrors: fe, data: { ...data, ...flagData(checks), isPublic: form.get("isPublic") === "on" ? "on" : "" } } };
  }
  return { ok: true as const, value: parsed.data, isPublic: form.get("isPublic") === "on" };
}

function flagData(checks: Record<string, boolean>) {
  return Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v ? "on" : ""]));
}

function toRow(v: ReturnType<typeof propertySchema.parse>) {
  return {
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

  const supabase = await createClient();
  // business_id comes from the server-side session, never from the form.
  const { data, error } = await supabase
    .from("properties")
    .insert({ ...toRow(result.value), is_public: result.isPublic, business_id: biz.businessId, created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: say("Couldn't save the property. Please try again.", "Hindi na-save ang property. Paki-try ulit."), data: readForm(form).data };

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

  revalidatePath("/app/properties");
  redirect(`/app/properties/${data.id}?notice=${ref ? "created-importing" : "created"}`);
}

export async function updateProperty(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const say = await appSay();
  const biz = await requireBusiness();
  if (!can(biz.role, "property.update")) return { error: say("Your role can't edit properties.", "Hindi pwedeng mag-edit ng properties ang role mo.") };

  const result = validate(form, say);
  if (!result.ok) return result.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .update({ ...toRow(result.value), is_public: result.isPublic, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .select("id");
  if (error) return { error: say("Couldn't save changes. Please try again.", "Hindi na-save ang changes. Paki-try ulit.") };
  if (!data?.length) return { error: say("You can't edit this property.", "Hindi mo pwedeng i-edit ang property na ito.") };

  revalidatePath("/app/properties");
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
