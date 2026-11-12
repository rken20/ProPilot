"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/form";
import { pesosToCentavos } from "@/lib/money";
import { cleanAreas, FINANCING, PROPERTY_TYPE_KEYS, TIMELINES } from "@/lib/qualification";
import { createClient } from "@/lib/supabase/server";

export type PrefsState = { error?: string; saved?: number };

/** Save what the buyer is looking for. RLS only allows the buyer's own row. */
export async function savePreferences(_prev: PrefsState, form: FormData): Promise<PrefsState> {
  const user = await requireUser();
  const min = pesosToCentavos(str(form, "budgetMin"));
  const max = pesosToCentavos(str(form, "budgetMax"));
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: "Type your budget in pesos, e.g. 4500000." };
  if (min !== null && max !== null && min > max) return { error: "Your lowest budget is higher than your highest." };
  const bedrooms = str(form, "bedrooms");
  const timeline = str(form, "timeline");
  const financing = str(form, "financing");
  const supabase = await createClient();
  const { error } = await supabase.from("buyer_preferences").upsert({
    user_id: user.id,
    budget_min_minor: min,
    budget_max_minor: max,
    areas: cleanAreas(str(form, "areas").split(",")),
    property_types: form.getAll("types").map(String).filter((t) => (PROPERTY_TYPE_KEYS as readonly string[]).includes(t)),
    bedrooms_min: /^(10|[0-9])$/.test(bedrooms) ? Number(bedrooms) : null,
    timeline: timeline in TIMELINES ? timeline : null,
    financing: financing in FINANCING ? financing : null,
    must_haves: str(form, "mustHaves").trim().slice(0, 300) || null,
    share_with_agents: form.get("share") === "on",
  });
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/buyer", "layout");
  return { saved: Date.now() };
}

export async function clearPreferences() {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("buyer_preferences").delete().eq("user_id", user.id);
  revalidatePath("/buyer", "layout");
}
