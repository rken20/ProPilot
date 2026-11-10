import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { Card, PageHeader } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { createProperty } from "../actions";
import { PropertyForm } from "../property-form";

export default async function NewPropertyPage() {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) redirect("/app/properties");
  return (
    <>
      <Link href="/app/properties" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Properties
      </Link>
      <PageHeader title="Add property" />
      <Card>
        <PropertyForm action={createProperty} initial={{}} submitLabel="Save property" />
      </Card>
    </>
  );
}
