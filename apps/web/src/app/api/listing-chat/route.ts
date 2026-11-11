import Anthropic from "@anthropic-ai/sdk";
import { after, NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { DEFAULT_MODEL, answer, sanitizeHistory } from "@/lib/listing-assistant";
import { getListing } from "@/lib/listings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Buyer asks about one listing. Signed-in only; the listing must be public. */
export async function POST(request: NextRequest) {
  if (!(await getUser())) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The assistant isn't switched on yet. You can still request a viewing and ask the agent directly." },
      { status: 503 },
    );
  }

  let body: { propertyId?: unknown; messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (typeof body.propertyId !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  // RLS-backed lookup: returns nothing unless the listing is public and unsold.
  const listing = await getListing(body.propertyId);
  if (!listing) return NextResponse.json({ error: "This listing is no longer available." }, { status: 404 });

  // Cap AI use per buyer (shared across all server instances via Postgres).
  const supabase = await createClient();
  const [hour, day] = await Promise.all([
    supabase.rpc("consume_rate_limit", { p_bucket: "listing_chat_hour", p_limit: 30, p_window_seconds: 3600 }),
    supabase.rpc("consume_rate_limit", { p_bucket: "listing_chat_day", p_limit: 100, p_window_seconds: 86400 }),
  ]);
  if (hour.error || day.error || hour.data !== true || day.data !== true) {
    return NextResponse.json(
      { error: "You've asked a lot of questions for now. Please try again later, or request a viewing to ask the agent." },
      { status: 429 },
    );
  }

  const history = sanitizeHistory(body.messages);
  if (!history.length || history.at(-1)!.role !== "user") {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const reply = await answer(client, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, listing, history);
    // Count the question for the agent's reports (no message text is stored).
    after(async () => {
      const admin = createAdminClient();
      if (!admin) return;
      const { data: prop } = await admin.from("properties").select("business_id").eq("id", listing.id).maybeSingle();
      if (prop) await admin.from("listing_question_events").insert({ business_id: prop.business_id, property_id: listing.id });
    });
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("listing-chat failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The assistant is busy right now. Please try again in a moment." }, { status: 502 });
  }
}
