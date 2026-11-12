import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { can } from "@propilot/shared";
import { Card, PageHeader } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewProspectForm } from "../prospect-forms";

export default async function NewProspectPage() {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.update")) redirect("/app/pipeline");
  const supabase = await createClient();
  const { data: listings } = await supabase
    .from("properties")
    .select("id, name")
    .eq("business_id", biz.businessId)
    .neq("status", "archived")
    .order("name")
    .limit(300);
  return (
    <div className="max-w-2xl">
      <Link href="/app/pipeline" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Pipeline
      </Link>
      <PageHeader title="Add a lead" description="For people who reach you outside ProPilot: walk-ins, calls, referrals and past clients." />
      <Card>
        <NewProspectForm listings={listings ?? []} />
      </Card>
    </div>
  );
}
