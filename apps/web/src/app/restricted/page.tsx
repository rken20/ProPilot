import { redirect } from "next/navigation";
import { Card, buttonClass } from "@/components/ui";
import { accountRestricted, getUser } from "@/lib/auth";

export const metadata = {
  title: "Account restricted · MyHomeSeller",
  robots: { index: false },
};

/** Where a person lands when the app admin has restricted their account. */
export default async function RestrictedPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!(await accountRestricted())) redirect("/app");
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">
          Your account is restricted
        </h1>
        <p className="mt-2 text-sm text-muted">
          MyHomeSeller has restricted the account for {user.email}. You
          can&apos;t open your business, and its listings and AI replies are
          paused while the restriction is on. Nothing has been deleted.
        </p>
        <p className="mt-3 text-sm text-muted">
          If you think this is a mistake, contact MyHomeSeller.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button type="submit" className={buttonClass("secondary")}>
            Sign out
          </button>
        </form>
      </Card>
    </main>
  );
}
