import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { metaOrigin } from "@/lib/meta-oauth";
import { metaConfig, parseWebhook, verifyWebhookSignature } from "@/lib/meta";
import { handleMessengerEvent } from "@/lib/messenger-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

// Answering can take several seconds after Meta gets its 200.
export const maxDuration = 60;

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Meta checks the webhook address once with the verify token. */
export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  if (p.get("hub.mode") === "subscribe" && token.length >= 16 && sameString(p.get("hub.verify_token") ?? "", token)) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Messenger events. Verify Meta's signature, answer 200 at once, do the work after. */
export async function POST(request: NextRequest) {
  const cfg = metaConfig();
  if (!cfg) return new NextResponse("not configured", { status: 503 });
  const raw = await request.text();
  if (raw.length > 1_000_000 || !verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return new NextResponse("bad signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  const events = parseWebhook(body).sort((a, b) => a.timestamp - b.timestamp);
  const origin = await metaOrigin();
  after(async () => {
    // Events for the same person run in order; different people in parallel.
    const byPerson = new Map<string, typeof events>();
    for (const e of events) byPerson.set(`${e.pageId}:${e.psid}`, [...(byPerson.get(`${e.pageId}:${e.psid}`) ?? []), e]);
    await Promise.all([...byPerson.values()].map(async (list) => {
      for (const e of list) await handleMessengerEvent(e, origin);
    }));
    if (Math.random() < 0.02) await createAdminClient()?.rpc("prune_messenger");
  });
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
