import { userLang } from "@/lib/lang-server";
import type { Account, AdminCounts } from "@/lib/admin-accounts";
import { requireSuperAdmin } from "@/lib/superadmin";
import { AdminTabs } from "../admin-tabs";
import { AccountsView } from "./accounts-view";
import { deleteAccount, setPlan, setRestricted, setVerified } from "./actions";

export const metadata = { title: "Accounts · MyHomeSeller admin" };

const LIMIT = 200;
const EMPTY: AdminCounts = {
  people: 0,
  new_people_7d: 0,
  signed_in_7d: 0,
  restricted: 0,
  businesses: 0,
  listings: 0,
  public_listings: 0,
  plans: {},
};

/** MyHomeSeller super admins only: who has signed up, and changing a plan, restricting or deleting an account. */
export default async function AdminAccountsPage({
  searchParams,
}: PageProps<"/admin/accounts">) {
  const { user, admin } = await requireSuperAdmin();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 100);
  const notice = typeof params.notice === "string" ? params.notice : undefined;

  const [
    { data: counts, error: countsError },
    { data: accounts, error: listError },
    { data: plans },
  ] = await Promise.all([
    admin.rpc("admin_counts", { p_by: user.id }),
    admin.rpc("admin_accounts", {
      p_by: user.id,
      p_search: q || null,
      p_limit: LIMIT,
    }),
    admin
      .from("plans")
      .select("code, name")
      .eq("is_active", true)
      .neq("price_minor", 0)
      .order("sort_order"),
  ]);
  if (countsError || listError)
    console.error(
      "[admin] accounts failed:",
      (countsError ?? listError)!.message,
    );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <AdminTabs current="/admin/accounts" />
      <AccountsView
        counts={{ ...EMPTY, ...((counts as AdminCounts | null) ?? {}) }}
        accounts={(accounts ?? []) as Account[]}
        plans={(plans ?? []).map((p) => ({
          code: p.code as string,
          name: p.name as string,
        }))}
        q={q}
        notice={notice}
        meId={user.id}
        now={new Date()}
        actions={{ setPlan, setRestricted, deleteAccount, setVerified }}
        limit={LIMIT}
        lang={await userLang()}
      />
    </main>
  );
}
