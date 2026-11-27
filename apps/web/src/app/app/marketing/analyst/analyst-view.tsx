import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  MousePointerClick,
  Play,
  Rocket,
  Share2,
} from "lucide-react";
import { Icon3d } from "@/components/icon-3d";
import {
  Alert,
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  StatTile,
  buttonClass,
  cx,
} from "@/components/ui";
import type { Say } from "@/lib/lang";
import {
  ageDays,
  boosted,
  interactions,
  leadsAfter,
  paidViews,
  type PostRow,
  type Recommendation,
  type Totals,
  type Verdict,
} from "@/lib/post-analyst";
import {
  ANALYST_DAYS,
  ANALYST_POSTS,
  type AnalystData,
} from "@/lib/post-analyst-data";

const n = (v: number) => v.toLocaleString("en-PH");
const day = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
});
const KIND: Record<PostRow["kind"], string> = {
  text: "Text post",
  photos: "Photo post",
  video: "Video",
};
const VERDICT: Record<Verdict, { label: string; className: string }> = {
  working: { label: "Working", className: "bg-tile-mint text-brand-700" },
  average: { label: "Average", className: "bg-grape-50 text-grape-700" },
  quiet: { label: "Quiet", className: "bg-tile-lemon text-brass-700" },
  new: { label: "Too new to tell", className: "bg-tile-sky text-ink/70" },
};

/** One number with its icon, or a dash when Facebook didn't give it. */
function Figure({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: number | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted">
        <Icon className="size-3.5 shrink-0" aria-hidden /> {label}
      </dt>
      <dd className="mt-0.5 text-lg leading-none font-extrabold tabular-nums">
        {value === null ? <span className="text-muted">–</span> : n(value)}
      </dd>
    </div>
  );
}

function PostCard({
  p,
  verdict,
  now,
  say,
}: {
  p: PostRow;
  verdict?: Verdict;
  now: Date;
  say: Say;
}) {
  const v = verdict ? VERDICT[verdict] : null;
  const a = p.after;
  const seconds = (ms: number | null) =>
    ms === null ? null : Math.round(ms / 1000);
  return (
    <li className="rounded-[1.5rem] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Badge>{KIND[p.kind]}</Badge>
            {boosted(p) ? <Badge tone="brand">Boosted</Badge> : null}
            {v ? (
              <span
                className={cx(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  v.className,
                )}
              >
                {v.label}
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 text-base font-bold break-words">
            {p.listing ? (
              <Link
                href={`/app/properties/${p.listing.id}`}
                className="hover:underline"
              >
                {p.listing.name}
              </Link>
            ) : (
              say("A listing that was since deleted", "Listing na na-delete na")
            )}
          </p>
          <p className="text-sm text-muted">
            {day.format(new Date(p.postedAt))} · {p.pageName}
          </p>
        </div>
        {p.permalink ? (
          <a
            href={p.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-grape-700 underline underline-offset-2"
          >
            Open on Facebook <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      {p.fb ? (
        <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6">
          <Figure icon={Heart} label="Reactions" value={p.fb.reactions} />
          <Figure icon={MessageCircle} label="Comments" value={p.fb.comments} />
          <Figure icon={Share2} label="Shares" value={p.fb.shares} />
          <Figure icon={Eye} label="Views" value={p.views} />
          <Figure icon={Rocket} label="From ads" value={p.adViews} />
          <Figure icon={MousePointerClick} label="Clicks" value={p.clicks} />
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {p.kind === "video" && ageDays(p, now) < 1
            ? say(
                "Facebook is still getting this video ready. Its numbers show once it is up.",
                "Inihahanda pa ng Facebook ang video na ito. Lalabas ang numbers kapag naka-up na.",
              )
            : say(
                "Facebook's numbers for this post couldn't be read just now.",
                "Hindi mabasa ngayon ang numbers ng Facebook para sa post na ito.",
              )}
        </p>
      )}
      {p.video && (p.video.plays !== null || p.video.avgWatchMs !== null) ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/85">
          <Play className="size-4 text-muted" aria-hidden />
          {p.video.plays !== null ? (
            <span>
              {say(
                `${n(p.video.plays)} plays of 3 seconds or more`,
                `${n(p.video.plays)} plays na 3 seconds pataas`,
              )}
            </span>
          ) : null}
          {p.video.avgWatchMs !== null ? (
            <span>
              {p.video.lengthMs !== null
                ? say(
                    `${seconds(p.video.avgWatchMs)} of ${seconds(p.video.lengthMs)} seconds watched on average`,
                    `${seconds(p.video.avgWatchMs)} sa ${seconds(p.video.lengthMs)} seconds ang napapanood sa average`,
                  )
                : say(
                    `${seconds(p.video.avgWatchMs)} seconds watched on average`,
                    `${seconds(p.video.avgWatchMs)} seconds ang napapanood sa average`,
                  )}
            </span>
          ) : null}
          {p.video.completes !== null ? (
            <span>
              {say(
                `${n(p.video.completes)} watched to the end`,
                `${n(p.video.completes)} ang nanood hanggang dulo`,
              )}
            </span>
          ) : null}
        </p>
      ) : null}

      {a ? (
        <p className="mt-4 rounded-2xl bg-tile-sky/60 px-3.5 py-2.5 text-sm text-ink/85">
          <span className="font-semibold">
            {a.days >= 7
              ? say(
                  "The listing in the 7 days after:",
                  "Ang listing sa 7 araw pagkatapos:",
                )
              : say(
                  `The listing in the ${a.days} ${a.days === 1 ? "day" : "days"} so far:`,
                  `Ang listing sa ${a.days} araw sa ngayon:`,
                )}
          </span>{" "}
          {say(
            `${n(a.views)} page ${a.views === 1 ? "view" : "views"} (${n(a.viewsBefore)} in the 7 days before), ${n(a.inquiries)} ${a.inquiries === 1 ? "inquiry" : "inquiries"}, ${n(a.chats)} Messenger ${a.chats === 1 ? "chat" : "chats"}.`,
            `${n(a.views)} page ${a.views === 1 ? "view" : "views"} (${n(a.viewsBefore)} sa 7 araw bago nito), ${n(a.inquiries)} ${a.inquiries === 1 ? "inquiry" : "inquiries"}, ${n(a.chats)} Messenger ${a.chats === 1 ? "chat" : "chats"}.`,
          )}
        </p>
      ) : null}
    </li>
  );
}

function Rec({ r, say }: { r: Recommendation; say: Say }) {
  return (
    <li className="flex gap-3.5 py-4 first:pt-1 last:pb-1">
      <Icon3d name={r.icon} size={34} className="mt-0.5 shrink-0 self-start" />
      <div className="min-w-0">
        <p className="font-bold">{r.title}</p>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink/85">
          {say(...r.body)}
        </p>
        {r.action ? (
          r.action.external ? (
            <a
              href={r.action.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(buttonClass("secondary"), "mt-3")}
            >
              {r.action.label} <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : (
            <Link
              href={r.action.href}
              className={cx(buttonClass("secondary"), "mt-3")}
            >
              {r.action.label}
            </Link>
          )
        ) : null}
      </div>
    </li>
  );
}

/** The Analyst screen. Every number is Facebook's or the app's own; a missing one shows as a dash. */
export function AnalystView({
  data,
  totals: t,
  verdicts,
  recs,
  canSeeReports,
  canConnect,
  now: nowIso,
  say,
}: {
  data: AnalystData;
  totals: Totals;
  verdicts: Record<string, Verdict>;
  recs: Recommendation[];
  canSeeReports: boolean;
  canConnect: boolean;
  now: string;
  say: Say;
}) {
  const now = new Date(nowIso);
  const posts = data.posts;
  const ads = posts.filter(boosted);
  const older = data.published - posts.length;
  return (
    <>
      <Link
        href="/app/marketing"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Marketing Agent
      </Link>
      <PageHeader
        icon3d="chart"
        tone="mint"
        title="Analyst"
        description={say(
          `How your Facebook posts and boosted posts from the last ${ANALYST_DAYS} days are doing, and what to do next.`,
          `Kumusta ang Facebook posts at boosted posts mo nitong huling ${ANALYST_DAYS} araw, at ano ang susunod na gagawin.`,
        )}
        action={
          canSeeReports ? (
            <Link href="/app/reports" className={buttonClass("secondary")}>
              View Detailed Reports
            </Link>
          ) : undefined
        }
      />

      {data.reconnect ? (
        <div className="mb-4">
          <Alert>
            {say(
              "Facebook access for your Page has expired or was removed, so its numbers can't be read.",
              "Nag-expire o natanggal ang Facebook access ng Page mo, kaya hindi mabasa ang numbers nito.",
            )}{" "}
            {canConnect ? (
              <Link
                href="/app/integrations"
                className="font-semibold underline underline-offset-2"
              >
                {say(
                  "Reconnect it in Connections",
                  "I-reconnect sa Connections",
                )}
              </Link>
            ) : (
              say("Ask the owner to reconnect it.", "Ipa-reconnect sa owner.")
            )}
          </Alert>
        </div>
      ) : null}

      {posts.length ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon="megaphone"
            tone="sky"
            label="Posts"
            value={n(data.published)}
            note={say(
              `From MyHomeSeller, last ${ANALYST_DAYS} days`,
              `Mula sa MyHomeSeller, huling ${ANALYST_DAYS} araw`,
            )}
          />
          <StatTile
            icon="heart"
            tone="pink"
            label="Reactions, Comments, Shares"
            value={t.read ? n(t.interactions) : "–"}
            note={
              t.read < posts.length
                ? say(
                    `On ${t.read} of ${posts.length} posts Facebook answered for`,
                    `Sa ${t.read} sa ${posts.length} posts na sinagot ng Facebook`,
                  )
                : undefined
            }
          />
          <StatTile
            icon="eyes"
            tone="lavender"
            label="Views on Facebook"
            value={t.views === null ? "–" : n(t.views)}
            note={
              t.views === null
                ? say(
                    "Facebook isn't giving view counts yet",
                    "Hindi pa nagbibigay ng view counts ang Facebook",
                  )
                : t.adViews
                  ? say(
                      `${n(t.adViews)} of them from ads`,
                      `${n(t.adViews)} dito ay mula sa ads`,
                    )
                  : say("None from ads", "Walang mula sa ads")
            }
          />
          <StatTile
            icon="handshake"
            tone="mint"
            label="Inquiries and Chats After"
            value={n(data.inquiries + data.chats)}
            note={say(
              `${n(data.inquiries)} inquiries, ${n(data.chats)} chats, in the 7 days after each post`,
              `${n(data.inquiries)} inquiries, ${n(data.chats)} chats, sa 7 araw pagkatapos ng bawat post`,
            )}
          />
        </div>
      ) : null}

      <Panel icon3d="lightbulb" title="What to Do Next">
        {recs.length ? (
          <ul className="divide-y divide-line">
            {recs.map((r) => (
              <Rec key={r.key} r={r} say={say} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            {posts.length
              ? say(
                  "Nothing stands out to change right now. Keep posting, and check back after your next post has been up a few days.",
                  "Walang kailangang baguhin sa ngayon. Ituloy ang pag-post, at bumalik kapag ilang araw nang naka-up ang susunod mong post.",
                )
              : say(
                  "Add a property first. Then post it to your Page, and its numbers show here.",
                  "Mag-add muna ng property. Tapos i-post sa Page mo, at lalabas dito ang numbers nito.",
                )}
          </p>
        )}
      </Panel>

      {posts.length ? (
        <>
          <div id="boosted" className="scroll-mt-24">
            <Panel icon3d="rocket" title="Boosted Posts" className="mt-6">
              {data.insights !== "on" ? (
                <p className="max-w-3xl text-sm leading-relaxed text-ink/85">
                  {say(
                    "Facebook isn't giving this Page's view counts to MyHomeSeller yet, so it can't tell which posts are boosted or how the boost is doing. Facebook gives them once the connection is allowed to read the Page's insights and the Page has 100 or more likes. Reactions, comments and shares are shown below meanwhile.",
                    "Hindi pa ibinibigay ng Facebook sa MyHomeSeller ang view counts ng Page na ito, kaya hindi nito masabi kung aling posts ang boosted o kumusta ang boost. Ibinibigay ito ng Facebook kapag pinayagan ang connection na basahin ang insights ng Page at may 100 o higit pang likes ang Page. Samantala, nasa baba ang reactions, comments at shares.",
                  )}
                </p>
              ) : ads.length ? (
                <>
                  <ul className="divide-y divide-line">
                    {ads.map((p) => {
                      const paid = paidViews(p);
                      const leads = leadsAfter(p);
                      const share =
                        p.views && (p.adViews ?? 0) > 0
                          ? Math.round((p.adViews! / p.views) * 100)
                          : null;
                      return (
                        <li key={p.id} className="py-3.5 first:pt-1 last:pb-1">
                          <p className="font-bold break-words">
                            {p.listing?.name ?? KIND[p.kind]}
                          </p>
                          <p className="mt-0.5 text-sm text-ink/85">
                            {say(
                              `${n(paid)} ${paid === 1 ? "view" : "views"} from ads${share !== null ? ` (${share}% of its ${n(p.views!)} views)` : ""}, ${n(interactions(p) ?? 0)} reactions, comments and shares. In the ${p.after?.days ?? 7} days after posting: ${n(p.after?.inquiries ?? 0)} inquiries and ${n(p.after?.chats ?? 0)} chats.`,
                              `${n(paid)} ${paid === 1 ? "view" : "views"} mula sa ads${share !== null ? ` (${share}% ng ${n(p.views!)} views nito)` : ""}, ${n(interactions(p) ?? 0)} reactions, comments at shares. Sa ${p.after?.days ?? 7} araw pagkatapos i-post: ${n(p.after?.inquiries ?? 0)} inquiries at ${n(p.after?.chats ?? 0)} chats.`,
                            )}{" "}
                            <span className="font-semibold">
                              {leads
                                ? say(
                                    "It is bringing people who ask.",
                                    "May mga nagtatanong dahil dito.",
                                  )
                                : ageDays(p, now) < 3
                                  ? say(
                                      "Too early to judge.",
                                      "Maaga pa para husgahan.",
                                    )
                                  : say(
                                      "Nobody has asked yet.",
                                      "Wala pang nagtatanong.",
                                    )}
                            </span>
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                    {say(
                      "A post counts as boosted when Facebook reports views from ads on it. What you spent, and the cost of each chat, are in Meta Ads Manager: MyHomeSeller can't read them yet.",
                      "Boosted ang post kapag may views mula sa ads ayon sa Facebook. Ang nagastos mo, at ang cost ng bawat chat, ay nasa Meta Ads Manager: hindi pa ito nababasa ng MyHomeSeller.",
                    )}
                  </p>
                </>
              ) : (
                <p className="max-w-3xl text-sm leading-relaxed text-ink/85">
                  {say(
                    "None of these posts has views from ads. Boost a post from your Page on Facebook and its ad views show here, beside the inquiries and chats that follow. Boosting from inside MyHomeSeller isn't built yet.",
                    "Wala sa mga post na ito ang may views mula sa ads. Mag-boost ng post mula sa Page mo sa Facebook at lalabas dito ang ad views nito, katabi ng inquiries at chats na susunod. Hindi pa nagagawa ang pag-boost sa loob ng MyHomeSeller.",
                  )}
                </p>
              )}
            </Panel>
          </div>

          <h2 className="mt-8 mb-3 text-lg font-extrabold tracking-tight">
            Your Posts
          </h2>
          <ul className="space-y-4">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                p={p}
                verdict={verdicts[p.id]}
                now={now}
                say={say}
              />
            ))}
          </ul>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">
            {older > 0
              ? say(
                  `Showing your newest ${ANALYST_POSTS} posts of ${n(data.published)}. `,
                  `Ang ${ANALYST_POSTS} pinakabagong posts mo sa ${n(data.published)} ang ipinapakita. `,
                )
              : ""}
            {say(
              "Facebook's numbers are read when you open this page. The listing's page views, inquiries and chats are the app's own and show what happened after a post, not what the post caused. Working, Average and Quiet compare a post with your own other posts, once three are at least two days old.",
              "Binabasa ang numbers ng Facebook pagbukas mo ng page na ito. Sariling bilang ng app ang page views, inquiries at chats ng listing, at ipinapakita nito ang nangyari pagkatapos ng post, hindi ang idinulot ng post. Kinukumpara ng Working, Average at Quiet ang post sa iba mong posts, kapag tatlo na ang hindi bababa sa dalawang araw.",
            )}
          </p>
        </>
      ) : data.connected ? (
        <EmptyState
          className="mt-6"
          icon="megaphone"
          tone="sky"
          title={say(
            "No posts in the last 90 days",
            "Walang posts nitong huling 90 araw",
          )}
          action={
            data.listings[0] ? (
              <Link
                href={`/app/properties/${data.listings[0].id}`}
                className={buttonClass("primary")}
              >
                Open a Listing to Post
              </Link>
            ) : (
              <Link
                href="/app/properties/new"
                className={buttonClass("primary")}
              >
                Add a Property
              </Link>
            )
          }
        >
          {say(
            "Post a listing or a video ad to your Page from MyHomeSeller, and how it does shows here.",
            "Mag-post ng listing o video ad sa Page mo mula sa MyHomeSeller, at lalabas dito kung kumusta ito.",
          )}
        </EmptyState>
      ) : null}
    </>
  );
}
