"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { viewingRequestSchema } from "@propilot/shared";
import { getOrigin, requireUser } from "@/lib/auth";
import { notifyNewLead, syncLeadsSheet } from "@/lib/lead-jobs";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

export async function toggleFavorite(propertyId: string, saved: boolean) {
  const user = await requireUser();
  const supabase = await createClient();
  if (saved) {
    await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("property_id", propertyId);
  } else {
    // RLS only allows saving listings that are public and unsold.
    await supabase
      .from("favorites")
      .insert({ user_id: user.id, property_id: propertyId });
  }
  revalidatePath("/buyer", "layout");
}

export async function requestViewing(
  propertyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const data = {
    buyerName: str(form, "buyerName"),
    buyerPhone: str(form, "buyerPhone"),
    preferredDate: str(form, "preferredDate"),
    budgetNote: str(form, "budgetNote"),
    message: str(form, "message"),
  };
  const parsed = viewingRequestSchema.safeParse({
    propertyId,
    buyerName: data.buyerName,
    buyerPhone: data.buyerPhone,
    preferredDate: data.preferredDate || undefined,
    budgetNote: data.budgetNote || undefined,
    message: data.message || undefined,
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsFrom(parsed.error), data };
  if (
    parsed.data.preferredDate &&
    parsed.data.preferredDate < new Date().toISOString().slice(0, 10)
  ) {
    return {
      fieldErrors: { preferredDate: "Pick today or a later date" },
      data,
    };
  }

  const supabase = await createClient();
  // business_id is filled in by the database from the listing itself.
  const { data: created, error } = await supabase
    .from("viewing_requests")
    .insert({
      business_id: "00000000-0000-0000-0000-000000000000",
      property_id: propertyId,
      buyer_id: user.id,
      buyer_name: parsed.data.buyerName,
      buyer_phone: parsed.data.buyerPhone,
      preferred_date: parsed.data.preferredDate ?? null,
      budget_note: parsed.data.budgetNote ?? null,
      message: parsed.data.message ?? null,
    })
    .select("id, business_id")
    .single();
  if (error || !created) {
    return {
      error:
        error && /not available/.test(error.message)
          ? "This listing is no longer taking viewing requests."
          : "Couldn't send your request. Please try again.",
      data,
    };
  }

  // Remember their phone for next time.
  await supabase
    .from("profiles")
    .update({ phone: parsed.data.buyerPhone })
    .eq("id", user.id);
  revalidatePath("/buyer/viewings");
  // Email the agent and update their Google Sheet after the buyer gets their answer.
  const origin = await getOrigin();
  after(async () => {
    await notifyNewLead(created.id as string, origin);
    await syncLeadsSheet(created.business_id as string);
  });
  return {
    ok: true,
    message: "Request sent. The agent will contact you to confirm a schedule.",
  };
}

export async function cancelViewing(id: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from("viewing_requests")
    .update({ status: "closed" })
    .eq("id", id);
  revalidatePath("/buyer/viewings");
}
