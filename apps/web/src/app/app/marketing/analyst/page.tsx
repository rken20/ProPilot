import { can } from "@propilot/shared";
import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { appSay } from "@/lib/lang-server";
import { businessPlan } from "@/lib/plan";
import { recommendations, totals, verdicts } from "@/lib/post-analyst";
import { loadAnalyst } from "@/lib/post-analyst-data";
import { boostsIncluded } from "@/lib/boost-rules";
import { AnalystView } from "./analyst-view";

export const metadata = { title: "Analyst" };
// Facebook is asked about each post when the page opens.
export const maxDuration = 30;

/** The Analyst: how the business's posts and boosted posts are doing, and what to do next. */
export default async function AnalystPage() {
  const biz = await requireBusiness();
  const reports = can(biz.role, "analytics.view");
  if (!reports && !can(biz.role, "content.publish")) redirect("/app/marketing");
  const now = new Date();
  const [data, plan, say] = await Promise.all([
    loadAnalyst(biz.businessId, now),
    businessPlan(biz.businessId),
    appSay(),
  ]);
  return (
    <AnalystView
      say={say}
      data={data}
      totals={totals(data.posts)}
      verdicts={Object.fromEntries(verdicts(data.posts, now))}
      recs={recommendations({
        posts: data.posts,
        connected: data.connected,
        listings: data.listings,
        videoAds: plan.videoAds !== 0,
        now,
      })}
      canSeeReports={reports}
      canConnect={can(biz.role, "business.update")}
      canBoost={boostsIncluded(plan.code)}
      now={now.toISOString()}
    />
  );
}
