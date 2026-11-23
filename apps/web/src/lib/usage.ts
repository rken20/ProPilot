import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { esc, sendEmail } from "./email";
import { manilaMonthStart } from "./matching";
import { businessPlan, type PlanInfo } from "./plan";
import { manilaDayStart } from "./reports";
import { crossed, nextPlan, usageItems, usageSentence, type UsageItem, type UsageKey } from "./usage-rules";

const SOURCES: Record<UsageKey, { table: string; ai?: boolean }> = {
  replies: { table: "messenger_messages", ai: true },
  finder: { table: "listing_matches" },
  priceChecks: { table: "price_checks" },
};

async function countUsed(db: SupabaseClient, businessId: string, key: UsageKey, from: string, before?: string): Promise<number> {
  let q = db.from(SOURCES[key].table).select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", from);
  if (SOURCES[key].ai) q = q.eq("sender", "ai");
  if (before) q = q.lt("created_at", before);
  return (await q).count ?? 0;
}

/** This month's use of each AI allowance on the business's plan (Manila calendar month). */
export async function businessUsage(db: SupabaseClient, businessId: string, plan: PlanInfo, before?: string): Promise<UsageItem[]> {
  const from = manilaMonthStart();
  const keys = usageItems(plan, { replies: 0, finder: 0, priceChecks: 0 }).map((i) => i.key);
  const counts = await Promise.all(keys.map((k) => countUsed(db, businessId, k, from, before)));
  const used = { replies: 0, finder: 0, priceChecks: 0, ...Object.fromEntries(keys.map((k, i) => [k, counts[i]!])) };
  return usageItems(plan, used);
}

/**
 * The daily email: tell owners and admins when an allowance reached 80% or ran
 * out yesterday. It compares the count at the start of today with the start of
 * yesterday, so each level is emailed once without keeping any record.
 */
export async function sendUsageEmails(admin: SupabaseClient, appOrigin: string, now = new Date(), deadline = Date.now() + 8_000): Promise<number> {
  const today = manilaDayStart(now);
  const yesterday = new Date(today.getTime() - 86_400_000);
  // On the 1st the allowances have just renewed.
  if (manilaMonthStart(now) === today.toISOString()) return 0;
  const { data: subs } = await admin.from("subscriptions").select("business_id").gt("current_period_end", now.toISOString()).limit(5000);
  let sent = 0;
  for (const s of subs ?? []) {
    if (Date.now() > deadline) break;
    const businessId = s.business_id as string;
    try {
      const plan = await businessPlan(businessId);
      const [atToday, atYesterday] = await Promise.all([
        businessUsage(admin, businessId, plan, today.toISOString()),
        businessUsage(admin, businessId, plan, yesterday.toISOString()),
      ]);
      const news = atToday.filter((item) => crossed(atYesterday.find((y) => y.key === item.key)?.used ?? 0, item.used, item.limit));
      if (!news.length) continue;

      const { data: members } = await admin.from("business_members").select("user_id").eq("business_id", businessId).eq("status", "active").in("role", ["owner", "admin"]);
      if (!members?.length) continue;
      const { data: profiles } = await admin.from("profiles").select("email").in("id", members.map((m) => m.user_id));
      const to = (profiles ?? []).map((p) => p.email as string | null).filter((e): e is string => Boolean(e));
      const out = news.some((i) => i.level === "out");
      const up = nextPlan(plan.code);
      const advice = `Allowances renew on the 1st.${up ? ` For more this month, upgrade to ${up.name} in Billing.` : ""}`;
      const lines = news.map(usageSentence);
      const url = `${appOrigin}/app/billing`;
      const subject = out ? `Your ${plan.name} plan: an AI allowance is used up` : `Your ${plan.name} plan: an AI allowance is running low`;
      const res = await sendEmail({
        to,
        subject,
        text: [...lines, "", advice, "", `Open Billing: ${url}`].join("\n"),
        html: `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1a17">
<h1 style="font-size:18px">${esc(subject)}</h1>
${lines.map((l) => `<p>${esc(l)}</p>`).join("")}
<p>${esc(advice)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#124fbf;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open Billing</a></p>
</body></html>`,
      });
      if (res.sent) sent++;
    } catch (e) {
      console.error("[usage] email:", e instanceof Error ? e.message : String(e));
    }
  }
  return sent;
}
