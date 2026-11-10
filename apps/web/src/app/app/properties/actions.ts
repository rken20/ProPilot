"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, propertySchema } from "@proppilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { pesosToCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const FORM_KEYS = [
  "name", "type", "location", "price", "reservationFee", "status", "description",
  "downpaymentPercent", "financingNotes",
] as const;

function readForm(form: FormData) {
  const data = Object.fromEntries(FORM_KEYS.map((k) => [k, str(form, k)])) as Record<(typeof FORM_KEYS)[number], string>;
  const checks = { bankFinancing: form.get("bankFinancing") === "on", pagIbig: form.get("pagIbig") === "on", inHouse: form.get("inHouse") === "on" };
  return { data, checks };
}

function validate(form: FormData) {
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
    const fe = fieldErrorsFrom(parsed.error);
    // Map nested schema paths to the form's field names.
    if (fe["price.amountMinor"]) fe.price = "Enter the price in pesos, e.g. 4500000";
    if (fe["reservationFee.amountMinor"]) fe.reservationFee = "Enter a peso amount, e.g. 25000";
    if (fe["financing.downpaymentPercent"]) fe.downpaymentPercent = "Enter a percentage from 0 to 100";
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
  const user = await requireUser();
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return { error: "Your role can't add properties." };

  const result = validate(form);
  if (!result.ok) return result.state;

  const supabase = await createClient();
  // business_id comes from the server-side session, never from the form.
  const { data, error } = await supabase
    .from("properties")
    .insert({ ...toRow(result.value), is_public: result.isPublic, business_id: biz.businessId, created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: "Couldn't save the property. Please try again.", data: readForm(form).data };

  revalidatePath("/app/properties");
  redirect(`/app/properties/${data.id}?notice=created`);
}

export async function updateProperty(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.update")) return { error: "Your role can't edit properties." };

  const result = validate(form);
  if (!result.ok) return result.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .update({ ...toRow(result.value), is_public: result.isPublic, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .select("id");
  if (error) return { error: "Couldn't save changes. Please try again." };
  if (!data?.length) return { error: "You can't edit this property." };

  revalidatePath("/app/properties");
  return { ok: true, message: "Saved." };
}

export async function archiveProperty(id: string) {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.delete")) return;
  const supabase = await createClient();
  await supabase.from("properties").update({ status: "archived" }).eq("id", id).eq("business_id", biz.businessId);
  revalidatePath("/app/properties");
  redirect("/app/properties?notice=archived");
}
