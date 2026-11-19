"use server";

import Anthropic from "@anthropic-ai/sdk";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { writeDescription, type DescriptionFacts } from "@/lib/listing-description";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { aiEnabled } from "@/lib/plan";
import { UPGRADE_MESSAGE } from "@/lib/plan-rules";
import { createClient } from "@/lib/supabase/server";

const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

/** Draft a listing description from what's in the form. Nothing is saved. */
export async function draftDescription(raw: Partial<DescriptionFacts>): Promise<{ text?: string; error?: string }> {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create") && !can(biz.role, "property.update")) return { error: "Your role can't edit listings." };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "The AI isn't switched on yet." };
  if (!(await aiEnabled(biz.businessId))) return { error: UPGRADE_MESSAGE };

  const facts: DescriptionFacts = {
    name: s(raw.name, 200),
    type: s(raw.type, 40),
    location: s(raw.location, 300),
    price: s(raw.price, 40),
    reservationFee: s(raw.reservationFee, 40),
    financing: Array.isArray(raw.financing) ? raw.financing.slice(0, 5).map((x) => s(x, 40)) : [],
    downpaymentPercent: s(raw.downpaymentPercent, 10),
    financingNotes: s(raw.financingNotes, 400),
    notes: s(raw.notes, 3000),
  };
  if (!facts.name.trim() && !facts.location.trim() && !facts.notes.trim()) {
    return { error: "Fill in the name and location first, and jot a few notes in the description box." };
  }

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "describe_listing", p_limit: 30, p_window_seconds: 3600 });
  if (allowed !== true) return { error: "You've written a lot of descriptions this hour. Please try again later." };

  try {
    const text = await writeDescription(new Anthropic({ apiKey }), process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, facts);
    return text ? { text } : { error: "The AI didn't return a description. Please try again." };
  } catch (e) {
    console.error("[describe] failed:", e instanceof Error ? e.message : String(e));
    return { error: "The AI is busy right now. Please try again in a moment." };
  }
}
