import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runScheduledAgents } from "@/lib/agent-runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendUsageEmails } from "@/lib/usage";
import { sendMatchEmails } from "@/lib/match-alerts";

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
  // Quick, and first, so the AI agents below can't use up its time.
  const origin = process.env.APP_ORIGIN?.replace(/\/$/, "") || request.nextUrl.origin;
  const usageEmails = await sendUsageEmails(admin, origin).catch(() => 0);
  // Buyers who agreed get the listings that fit them, paid sellers' listings first.
  const matches = await sendMatchEmails(admin, origin).catch(() => ({ emails: 0, listings: 0 }));
  // Plans given to beta testers by email that can turn on now (the tester has since signed up).
  const { data: grantsUsed } = await admin.rpc("claim_plan_grants");
  const result = await runScheduledAgents(admin);
  return NextResponse.json({ ...result, usageEmails, matchEmails: matches.emails, planGrants: typeof grantsUsed === "number" ? grantsUsed : 0 });
}
