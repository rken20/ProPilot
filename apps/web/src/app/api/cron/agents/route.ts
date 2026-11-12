import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runScheduledAgents } from "@/lib/agent-runs";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * The daily AI agents run, called by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (secret.length < 16 || got.length !== want.length || !timingSafeEqual(got, want)) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return new NextResponse("not configured", { status: 503 });
  const result = await runScheduledAgents(admin);
  return NextResponse.json(result);
}
