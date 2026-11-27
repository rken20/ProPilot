import { sayIn, type Lang, type Say } from "@/lib/lang";
import {
  Alert,
  Badge,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  buttonClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import {
  ACCOUNT_NOTICES,
  defaultUntil,
  manilaDate,
  paidBusinesses,
  type Account,
  type AccountBusiness,
  type AdminCounts,
} from "@/lib/admin-accounts";

const day = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const ROLE: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  agent: "Agent",
  marketing: "Marketing",
};
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

type Actions = {
  setPlan: (businessId: string, form: FormData) => Promise<void>;
  setRestricted: (
    userId: string,
    restricted: boolean,
    form: FormData,
  ) => Promise<void>;
  deleteAccount: (userId: string, form: FormData) => Promise<void>;
  setVerified: (
    businessId: string,
    verified: boolean,
    form: FormData,
  ) => Promise<void>;
};

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">
        {value.toLocaleString("en-PH")}
      </p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function PlanForm({
  b,
  q,
  now,
  setPlan,
  plans,
  say,
}: {
  say: Say;
  b: AccountBusiness;
  q: string;
  now: Date;
  setPlan: Actions["setPlan"];
  plans: Array<{ code: string; name: string }>;
}) {
  const id = `plan-${b.id}`;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-semibold text-grape-700 hover:text-grape-800">
        Change plan
      </summary>
      <form
        action={setPlan.bind(null, b.id)}
        className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-grape-50/60 p-3"
      >
        <input type="hidden" name="q" value={q} />
        <div className="w-36">
          <Label htmlFor={`${id}-plan`}>Plan</Label>
          <Select id={`${id}-plan`} name="plan" defaultValue={b.plan_code}>
            <option value="free">Free</option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Label htmlFor={`${id}-until`}>Runs until</Label>
          <Input
            id={`${id}-until`}
            name="until"
            type="date"
            min={manilaDate(now)}
            defaultValue={defaultUntil(b.period_end, now)}
          />
        </div>
        <SubmitButton variant="secondary" pendingText="Saving…">
          Save plan
        </SubmitButton>
        <p className="w-full text-xs text-muted">
          {say(
            "Free ends the paid plan now, and the date is ignored. Nothing is charged either way.",
            "Kapag Free, matatapos agad ang paid plan at hindi na gagamitin ang date. Walang sisingilin alinman dito.",
          )}
        </p>
      </form>
    </details>
  );
}

/** Mark a business as a verified seller, or take the mark away. */
function VerifyForm({
  b,
  q,
  setVerified,
  say,
}: {
  say: Say;
  b: AccountBusiness;
  q: string;
  setVerified: Actions["setVerified"];
}) {
  if (b.verified_at)
    return (
      <div className="mt-2 rounded-2xl bg-tile-mint/60 p-3 text-sm">
        <p>
          <span className="font-semibold">
            Verified {day.format(new Date(b.verified_at))}.
          </span>{" "}
          {b.verified_note}
        </p>
        <form action={setVerified.bind(null, b.id, false)} className="mt-2">
          <input type="hidden" name="q" value={q} />
          <SubmitButton variant="secondary" pendingText="Saving…">
            Remove Verified Mark
          </SubmitButton>
        </form>
      </div>
    );
  const id = `verify-${b.id}`;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-semibold text-grape-700 hover:text-grape-800">
        Mark as verified seller
      </summary>
      <form
        action={setVerified.bind(null, b.id, true)}
        className="mt-3 space-y-3 rounded-2xl bg-grape-50/60 p-3"
      >
        <input type="hidden" name="q" value={q} />
        <p className="text-xs text-muted">
          {say(
            "Check their ID or licence with them directly first (a video call, in person, or the PRC or DHSUD lookup). Don't paste ID numbers or documents here: write only what you checked and when.",
            "I-check muna nang direkta ang ID o licence nila (video call, personal, o sa PRC o DHSUD lookup). Huwag mag-paste ng ID numbers o documents dito: isulat lang kung ano ang chineck mo at kailan.",
          )}
        </p>
        <div>
          <Label htmlFor={id}>What you checked</Label>
          <Input
            id={id}
            name="note"
            required
            maxLength={500}
            placeholder="Government ID seen on a video call, 27 Nov"
          />
        </div>
        <SubmitButton variant="secondary" pendingText="Saving…">
          Mark Verified
        </SubmitButton>
      </form>
    </details>
  );
}

function AccountCard({
  a,
  meId,
  q,
  now,
  actions,
  plans,
  say,
}: {
  say: Say;
  a: Account;
  meId: string;
  q: string;
  now: Date;
  actions: Actions;
  plans: Array<{ code: string; name: string }>;
}) {
  const restricted = a.status !== "active";
  const locked = a.user_id === meId || a.is_superadmin;
  const goes = a.businesses.filter((b) => b.sole_owner);
  const stays = a.businesses.filter((b) => !b.sole_owner);
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold tracking-tight">
            <span className="break-words">{a.full_name || "No name yet"}</span>
            {a.is_superadmin ? <Badge tone="brand">App admin</Badge> : null}
            {a.user_id === meId ? <Badge>You</Badge> : null}
            {restricted ? <Badge tone="hot">Restricted</Badge> : null}
          </p>
          <p className="text-sm break-all text-muted">
            {a.email ?? "No email"}
          </p>
        </div>
        <p className="text-xs text-muted sm:text-right">
          Signed up {day.format(new Date(a.signed_up))}
          <br />
          {a.last_sign_in
            ? `Last signed in ${day.format(new Date(a.last_sign_in))}`
            : "Never signed in"}
        </p>
      </div>

      {a.businesses.length ? (
        <ul className="space-y-3 border-t border-line pt-4">
          {a.businesses.map((b) => (
            <li key={b.id}>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-semibold break-words">{b.name}</span>
                <span className="text-muted">
                  {ROLE[b.role] ?? b.role}
                  {b.member_status !== "active" ? " (deactivated)" : ""} ·{" "}
                  {plural(b.listings, "listing")}
                </span>
                <Badge tone={b.plan_code === "free" ? "neutral" : "brand"}>
                  {b.plan_name}
                  {b.period_end
                    ? ` until ${day.format(new Date(b.period_end))}`
                    : ""}
                </Badge>
                {b.restricted ? (
                  <Badge tone="hot">Off public pages</Badge>
                ) : null}
                {b.verified_at ? (
                  <Badge tone="brand">Verified seller</Badge>
                ) : null}
              </p>
              {b.role === "owner" ? (
                <PlanForm
                  say={say}
                  b={b}
                  q={q}
                  now={now}
                  setPlan={actions.setPlan}
                  plans={plans}
                />
              ) : null}
              {b.role === "owner" ? (
                <VerifyForm
                  say={say}
                  b={b}
                  q={q}
                  setVerified={actions.setVerified}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line pt-4 text-sm text-muted">
          Hasn&apos;t set up a business yet.
        </p>
      )}

      {locked ? null : (
        <div className="flex flex-wrap items-start gap-3 border-t border-line pt-4">
          <form
            action={actions.setRestricted.bind(null, a.user_id, !restricted)}
          >
            <input type="hidden" name="q" value={q} />
            <SubmitButton variant="secondary" pendingText="Saving…">
              {restricted ? "Lift restriction" : "Restrict"}
            </SubmitButton>
          </form>
          <details className="min-w-0 open:basis-full">
            <summary className="inline-flex cursor-pointer list-none rounded-full px-4 py-2.5 text-sm font-semibold text-hot hover:bg-hot-50 [&::-webkit-details-marker]:hidden">
              Delete account…
            </summary>
            <form
              action={actions.deleteAccount.bind(null, a.user_id)}
              className="mt-3 space-y-3 rounded-2xl border border-hot/30 bg-hot-50 p-4"
            >
              <input type="hidden" name="q" value={q} />
              <div className="text-sm text-ink">
                <p className="font-semibold">
                  {say(
                    "This can't be undone. It deletes:",
                    "Hindi na ito maibabalik. Made-delete ang:",
                  )}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>
                    {say(
                      "Their sign-in, profile and photo",
                      "Sign-in, profile at photo nila",
                    )}
                  </li>
                  {goes.map((b) => (
                    <li key={b.id}>
                      <span className="font-semibold">{b.name}</span>{" "}
                      {say(
                        `and everything in it: ${plural(b.listings, "listing")} with photos, leads, messages and offers`,
                        `at lahat ng laman nito: ${plural(b.listings, "listing")} kasama ang photos, leads, messages at offers`,
                      )}
                    </li>
                  ))}
                </ul>
                {stays.length ? (
                  <p className="mt-2">
                    {say(
                      "Kept, because someone else owns or runs it:",
                      "Mananatili, dahil may iba pang owner o nagpapatakbo nito:",
                    )}{" "}
                    {stays.map((b) => b.name).join(", ")}.{" "}
                    {say(
                      "This person is only removed from it.",
                      "Aalisin lang dito ang taong ito.",
                    )}
                  </p>
                ) : null}
              </div>
              <div className="max-w-sm">
                <Label htmlFor={`confirm-${a.user_id}`}>
                  Type their email to confirm
                </Label>
                <Input
                  id={`confirm-${a.user_id}`}
                  name="confirm"
                  type="email"
                  required
                  autoComplete="off"
                  placeholder={a.email ?? ""}
                />
              </div>
              <SubmitButton variant="danger" pendingText="Deleting…">
                Delete for good
              </SubmitButton>
            </form>
          </details>
        </div>
      )}
    </Card>
  );
}

/** The app admin's Accounts screen: how many people and businesses there are, and each account with what can be done to it. */
export function AccountsView({
  counts,
  accounts,
  plans,
  q,
  notice,
  meId,
  now,
  actions,
  limit,
  lang,
}: {
  /** Taglish or English: the admin's own business language. */
  lang: Lang;
  counts: AdminCounts;
  accounts: Account[];
  plans: Array<{ code: string; name: string }>;
  q: string;
  notice?: string;
  meId: string;
  now: Date;
  actions: Actions;
  limit: number;
}) {
  const said = notice ? ACCOUNT_NOTICES[notice] : undefined;
  const say = sayIn(lang);
  const byPlan = plans
    .map((p) => `${p.name} ${counts.plans[p.code] ?? 0}`)
    .join(" · ");
  return (
    <>
      <PageHeader icon3d="team" tone="lavender"
        title="Accounts"
        description={say(
          "Everyone who has signed up, their businesses and plans. Change a plan, restrict an account or delete one.",
          "Lahat ng nag-sign up, pati ang businesses at plans nila. Magpalit ng plan, mag-restrict ng account o mag-delete.",
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          label="People signed up"
          value={counts.people}
          note={`${counts.new_people_7d} new in the last 7 days`}
        />
        <Tile label="Signed in this week" value={counts.signed_in_7d} />
        <Tile label="Businesses" value={counts.businesses} />
        <Tile
          label="On a paid or given plan"
          value={paidBusinesses(counts.plans)}
          note={byPlan}
        />
        <Tile
          label="Listings"
          value={counts.listings}
          note={`${counts.public_listings} with a public page`}
        />
        <Tile label="Restricted accounts" value={counts.restricted} />
      </div>

      {said ? (
        <div className="mb-4">
          <Alert tone={said.tone}>{say(said.text, said.textTl)}</Alert>
        </div>
      ) : null}

      <form
        method="get"
        action="/admin/accounts"
        className="mb-4 flex flex-wrap items-end gap-3"
        role="search"
      >
        <div className="min-w-56 flex-1">
          <Label htmlFor="accounts-q">Find an account</Label>
          <Input
            id="accounts-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Email, name or business"
          />
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Search
        </button>
        {q ? (
          <a href="/admin/accounts" className={buttonClass("ghost")}>
            Show all
          </a>
        ) : null}
      </form>

      {accounts.length ? (
        <>
          <p className="mb-3 text-sm text-muted">
            {q
              ? say(
                  `${plural(accounts.length, "account")} found for “${q}”`,
                  `${plural(accounts.length, "account")} ang nahanap para sa “${q}”`,
                )
              : say(
                  `${plural(accounts.length, "account")}, newest first`,
                  `${plural(accounts.length, "account")}, pinakabago ang una`,
                )}
            {accounts.length >= limit
              ? say(
                  `. Showing the first ${limit}: search to find others.`,
                  `. Ang unang ${limit} lang ang ipinapakita: mag-search para mahanap ang iba.`,
                )
              : ""}
          </p>
          <ul className="space-y-4">
            {accounts.map((a) => (
              <li key={a.user_id}>
                <AccountCard
                  say={say}
                  a={a}
                  meId={meId}
                  q={q}
                  now={now}
                  actions={actions}
                  plans={plans}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Card>
          <p className="font-semibold">
            {q
              ? say(
                  `No account matches “${q}”.`,
                  `Walang account na tugma sa “${q}”.`,
                )
              : say("Nobody has signed up yet.", "Wala pang nag-sign up.")}
          </p>
        </Card>
      )}
    </>
  );
}
