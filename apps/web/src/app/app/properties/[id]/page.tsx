import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@propilot/shared";
import { Alert, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getUser, requireBusiness } from "@/lib/auth";
import { centavosToPesosInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { archiveProperty, updateProperty } from "../actions";
import { PropertyForm } from "../property-form";

export default async function PropertyPage({ params, searchParams }: PageProps<"/app/properties/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [biz, user] = await Promise.all([requireBusiness(), getUser()]);
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  if (!p) notFound();

  const financing = (p.financing ?? {}) as Record<string, unknown>;
  const initial = {
    name: p.name,
    type: p.type,
    status: p.status,
    location: p.location,
    price: centavosToPesosInput(p.price_minor),
    reservationFee: centavosToPesosInput(p.reservation_fee_minor),
    description: p.description ?? "",
    downpaymentPercent: financing.downpaymentPercent === undefined ? "" : String(financing.downpaymentPercent),
    financingNotes: typeof financing.notes === "string" ? financing.notes : "",
    bankFinancing: financing.bankFinancing ? "on" : "",
    pagIbig: financing.pagIbig ? "on" : "",
    inHouse: financing.inHouse ? "on" : "",
    isPublic: p.is_public ? "on" : "",
  };

  // Owners/admins edit any listing; agents only listings assigned to them (RLS enforces the same).
  const canEdit =
    can(biz.role, "property.create") || (can(biz.role, "property.update") && p.assigned_agent_id === user?.id);

  return (
    <>
      <Link href="/app/properties" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Properties
      </Link>
      <PageHeader title={p.name} description={p.location} />
      {sp.notice === "created" ? (
        <div className="mb-4">
          <Alert tone="success">Property saved.</Alert>
        </div>
      ) : null}
      <Card>
        <PropertyForm action={updateProperty.bind(null, p.id)} initial={initial} submitLabel="Save changes" readOnly={!canEdit} />
      </Card>

      {can(biz.role, "property.delete") && p.status !== "archived" ? (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Archive this property</p>
            <p className="text-sm text-zinc-600">It stays in your records but the assistant stops offering it.</p>
          </div>
          <form action={archiveProperty.bind(null, p.id)}>
            <SubmitButton variant="danger" pendingText="Archiving…">
              Archive
            </SubmitButton>
          </form>
        </Card>
      ) : null}
    </>
  );
}
