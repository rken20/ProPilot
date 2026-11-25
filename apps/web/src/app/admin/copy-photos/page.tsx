import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireSuperAdmin } from "@/lib/superadmin";
import { copyOldPhotos } from "./actions";

export const metadata = {
  title: "Copy photos · MyHomeSeller admin",
  robots: { index: false },
};

const n = (v: string | string[] | undefined) =>
  typeof v === "string" && /^\d{1,6}$/.test(v) ? Number(v) : null;

/** Temporary, super admins only: copy listing and profile photos over after the database move. */
export default async function CopyPhotosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const q = await searchParams;
  const total = n(q.total);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <PageHeader title="Copy photos from the old database" />
      <Card className="space-y-4 p-5">
        <p className="text-sm text-muted">
          Copies every listing photo and profile photo from the old storage into
          the new one. Photos already copied are skipped, so it is safe to press
          again.
        </p>
        {total !== null && (
          <p role="status" className="text-sm font-semibold text-ink">
            {total} photos found: {n(q.copied)} copied, {n(q.already)} were
            already there, {n(q.failed)} failed.
          </p>
        )}
        <form action={copyOldPhotos}>
          <SubmitButton pendingText="Copying…">Copy photos</SubmitButton>
        </form>
      </Card>
    </main>
  );
}
