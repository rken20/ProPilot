import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";
import {
  EmptyState,
  IconTitle,
  PageHeader,
  TILES,
  buttonClass,
  cx,
  type Pastel,
} from "@/components/ui";
import type { Say } from "@/lib/lang";

export type MarketingData = {
  /** Video Ad Maker: this month's use, or null when the plan doesn't include it. */
  videos: { used: number; limit: number | null } | null;
  /** Facebook: whether a Page is connected, and posts made from the app this month. */
  facebook: {
    connected: boolean;
    postsThisMonth: number;
    postHref: string | null;
  };
  canSeeReports: boolean;
  /** The listing that drew the most views in the last 30 days, if any had views. */
  top: { id: string; name: string; views: number; isPublic: boolean } | null;
  hasListings: boolean;
  /** Leads that fit a listing for sale, best first. Null when this person can't see leads. */
  buyers: Array<{
    id: string;
    name: string;
    score: number;
    listing: string;
  }> | null;
};

/**
 * The Marketing Agent: one place for everything that gets a listing seen.
 * Every number here is real. Boost and Ads aren't built yet and say so.
 */
export function MarketingView({
  data,
  say,
}: {
  data: MarketingData;
  say: Say;
}) {
  const { videos, facebook, top } = data;
  const tiles: Array<{
    icon: Icon3dName;
    tone: Pastel;
    title: string;
    note: string;
    href?: string;
  }> = [
    {
      icon: "camera",
      tone: "pink",
      title: "Create Videos",
      note: videos
        ? videos.limit === null
          ? say(
              `${videos.used} made this month`,
              `${videos.used} na ang nagawa ngayong buwan`,
            )
          : say(
              `${videos.used} of ${videos.limit} made this month`,
              `${videos.used} sa ${videos.limit} ang nagawa ngayong buwan`,
            )
        : say(
            "Video ads from your photos. Pro plan",
            "Video ads mula sa photos mo. Pro plan",
          ),
      href: "/app/video",
    },
    {
      icon: "megaphone",
      tone: "sky",
      title: "Social Media",
      note: facebook.connected
        ? facebook.postsThisMonth === 1
          ? say("1 Facebook post this month", "1 Facebook post ngayong buwan")
          : say(
              `${facebook.postsThisMonth} Facebook posts this month`,
              `${facebook.postsThisMonth} Facebook posts ngayong buwan`,
            )
        : say("Connect your Facebook Page", "I-connect ang Facebook Page mo"),
      href: facebook.connected
        ? (facebook.postHref ?? "/app/properties")
        : "/app/integrations",
    },
    {
      icon: "rocket",
      tone: "lemon",
      title: "Boost",
      note: say(
        "Coming soon: boost a post, with your OK on every spend",
        "Coming soon: i-boost ang post, may OK mo sa bawat gastos",
      ),
    },
    {
      icon: "target",
      tone: "peach",
      title: "Ads",
      note: say(
        "Coming soon: results of your boosts and what to change",
        "Coming soon: resulta ng boosts mo at ano ang babaguhin",
      ),
    },
    {
      icon: "chart",
      tone: "mint",
      title: "Analyst",
      note: say(
        "Your views, inquiries and sales",
        "Views, inquiries at sales mo",
      ),
      href: data.canSeeReports ? "/app/reports" : undefined,
    },
  ];

  return (
    <>
      <PageHeader
        icon3d="megaphone"
        tone="sky"
        title="Marketing Agent"
        description={say(
          "Get your listings seen, then find the buyers who fit them.",
          "Ipakita ang listings mo, tapos hanapin ang buyers na bagay sa kanila.",
        )}
      />

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const body = (
            <>
              <Icon3d name={t.icon} size={40} />
              <span className="mt-3 block text-base leading-tight font-extrabold">
                {t.title}
              </span>
              <span className="mt-1 block text-sm leading-snug text-ink/75">
                {t.note}
              </span>
            </>
          );
          const box = cx(
            "flex h-full min-h-32 flex-col rounded-[var(--radius-tile)] p-4",
            TILES[t.tone],
          );
          return (
            <li key={t.title} className="last:max-lg:col-span-2">
              {t.href ? (
                <Link href={t.href} className={cx(box, "pp-lift pp-bounce")}>
                  {body}
                </Link>
              ) : (
                <div className={cx(box, "opacity-80")}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      <section className="mt-6 rounded-[1.75rem] bg-gradient-to-br from-[#1a4bb0] to-[#0c2563] p-6 text-white sm:p-7">
        <IconTitle icon="sparkles" size={26} className="text-lg font-extrabold">
          {top ? "Share Your Most-Viewed Listing" : "Get Your First Views"}
        </IconTitle>
        <p className="mt-2 max-w-2xl text-white/85">
          {top
            ? top.views === 1
              ? say(
                  `${top.name} had 1 view in the last 30 days, the most of your listings.`,
                  `May 1 view ang ${top.name} nitong huling 30 araw, pinakamarami sa listings mo.`,
                )
              : say(
                  `${top.name} had ${top.views} views in the last 30 days, the most of your listings.`,
                  `May ${top.views} views ang ${top.name} nitong huling 30 araw, pinakamarami sa listings mo.`,
                )
            : data.hasListings
              ? say(
                  "None of your listings had views in the last 30 days. Share a listing's public page, or post it to your Facebook Page.",
                  "Wala pang views ang listings mo nitong huling 30 araw. I-share ang public page ng isang listing, o i-post ito sa Facebook Page mo.",
                )
              : say(
                  "Add a property first. It gets its own public page you can share anywhere.",
                  "Mag-add muna ng property. Magkakaroon ito ng sariling public page na pwede mong i-share kahit saan.",
                )}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {top ? (
            <>
              {videos ? (
                <Link
                  href={`/app/video?property=${top.id}`}
                  className={buttonClass("sun")}
                >
                  Make a Video Ad <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : null}
              <Link
                href={`/app/properties/${top.id}`}
                className={cx(buttonClass("secondary"), videos ? "" : "")}
              >
                {facebook.connected
                  ? "Post It to Facebook"
                  : "Open the Listing"}
              </Link>
            </>
          ) : (
            <Link
              href={
                data.hasListings ? "/app/properties" : "/app/properties/new"
              }
              className={buttonClass("sun")}
            >
              {data.hasListings ? "Open Properties" : "Add a Property"}{" "}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </section>

      {data.buyers ? (
        <section className="mt-6 rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
          <IconTitle icon="search" size={26} className="text-lg font-extrabold">
            Find Buyers
          </IconTitle>
          <p className="mt-1 text-sm text-muted">
            {say(
              "Your own leads that fit a listing you have for sale, by type, budget and area.",
              "Sarili mong leads na bagay sa listing mong for sale, ayon sa type, budget at area.",
            )}
          </p>
          {data.buyers.length ? (
            <ul className="mt-4 divide-y divide-line">
              {data.buyers.map((b) => (
                <li
                  key={`${b.id}:${b.listing}`}
                  className="flex items-center gap-3 py-3"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-tile-lavender text-base font-extrabold text-grape-700"
                    aria-hidden
                  >
                    {b.name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {b.name}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {b.score}% match · {b.listing}
                    </span>
                  </span>
                  <Link
                    href={`/app/pipeline/${b.id}`}
                    className="shrink-0 rounded-full bg-tile-sky px-4 py-2 text-sm font-bold text-grape-700 hover:bg-brand-100"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="mt-4"
              icon="search"
              tone="lavender"
              title={say("No matching leads yet", "Wala pang tugmang lead")}
            >
              {say(
                "A lead needs at least two of property type, budget and area to be matched. The AI collects these as it chats.",
                "Kailangan ng lead ng kahit dalawa sa property type, budget at area para ma-match. Kinukuha ito ng AI habang nakikipag-chat.",
              )}
            </EmptyState>
          )}
        </section>
      ) : null}
    </>
  );
}
