import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { DEFAULT_MODEL, answer, sanitizeHistory } from "@/lib/listing-assistant";
import { getListing } from "@/lib/listings";

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

  const history = sanitizeHistory(body.messages);
  if (!history.length || history.at(-1)!.role !== "user") {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const reply = await answer(client, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, listing, history);
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("listing-chat failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The assistant is busy right now. Please try again in a moment." }, { status: 502 });
  }
}
