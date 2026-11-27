/**
 * The Analyst: how the posts made from the app are doing on Facebook, which of
 * them are boosted, and what to do next. Everything here is worked out from
 * numbers Facebook or the app really has. A number that couldn't be read is
 * null and is shown as missing, never as zero, and every recommendation
 * carries the numbers it came from.
 */

export type PostKind = "text" | "photos" | "video";

export type PostRow = {
  id: string;
  kind: PostKind;
  pageName: string;
  postedAt: string;
  permalink: string | null;
  listing: {
    id: string;
    name: string;
    isPublic: boolean;
    forSale: boolean;
  } | null;
  /** Reactions, comments and shares. Null: Facebook didn't answer for this post. */
  fb: { reactions: number; comments: number; shares: number } | null;
  /** Times the post was shown or played. Null without insights. */
  views: number | null;
  /** How many of those views came from ads, which is how a boost shows up. Null when Facebook doesn't say. */
  adViews: number | null;
  clicks: number | null;
  video: {
    /** Plays of 3 seconds or more. */
    plays: number | null;
    paidPlays: number | null;
    avgWatchMs: number | null;
    lengthMs: number | null;
    /** Plays to the end. */
    completes: number | null;
  } | null;
  /**
   * The listing's own numbers in the app in the 7 days from the post (fewer
   * days for a newer post), and its page views in the 7 days before. They
   * show what happened after the post, not what the post caused.
   */
  after: {
    days: number;
    views: number;
    viewsBefore: number;
    inquiries: number;
    chats: number;
  } | null;
};

export const WINDOW_DAYS = 7;
const DAY = 86_400_000;

export const ageDays = (p: Pick<PostRow, "postedAt">, now: Date) =>
  Math.max(
    0,
    Math.floor((now.getTime() - new Date(p.postedAt).getTime()) / DAY),
  );
export const interactions = (p: PostRow) =>
  p.fb ? p.fb.reactions + p.fb.comments + p.fb.shares : null;
/** Inquiries and Messenger chats about the listing after the post. */
export const leadsAfter = (p: PostRow) =>
  p.after ? p.after.inquiries + p.after.chats : 0;
/** Facebook reports views or plays from ads on it. */
export const boosted = (p: PostRow) =>
  (p.adViews ?? 0) > 0 || (p.video?.paidPlays ?? 0) > 0;
/** Views from ads, or paid plays of a video when Facebook gave only those. */
export const paidViews = (p: PostRow) =>
  (p.adViews ?? 0) > 0 ? p.adViews! : (p.video?.paidPlays ?? 0);

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type Verdict = "working" | "average" | "quiet" | "new";

/**
 * A plain verdict per post, against the business's own other posts. With
 * fewer than three posts old enough to judge there is nothing to compare
 * with, so there is no verdict.
 */
export function verdicts(posts: PostRow[], now: Date): Map<string, Verdict> {
  const out = new Map<string, Verdict>();
  const old = posts.filter((p) => p.fb && ageDays(p, now) >= 2);
  for (const p of posts) if (p.fb && ageDays(p, now) < 2) out.set(p.id, "new");
  if (old.length < 3) return out;
  const usual = median(old.map((p) => interactions(p)!));
  for (const p of old) {
    const got = interactions(p)!;
    const leads = leadsAfter(p);
    if (
      (leads >= 1 && got >= usual) ||
      (got >= 5 && got >= 2 * Math.max(usual, 1))
    )
      out.set(p.id, "working");
    else if (leads === 0 && (got === 0 || got * 2 < usual))
      out.set(p.id, "quiet");
    else out.set(p.id, "average");
  }
  return out;
}

export type Totals = {
  posts: number;
  /** Posts Facebook answered for. */
  read: number;
  interactions: number;
  /** Null when no post has view counts. */
  views: number | null;
  boosted: number;
  adViews: number;
};

export function totals(posts: PostRow[]): Totals {
  const withViews = posts.filter((p) => p.views !== null);
  return {
    posts: posts.length,
    read: posts.filter((p) => p.fb).length,
    interactions: posts.reduce((n, p) => n + (interactions(p) ?? 0), 0),
    views: withViews.length
      ? withViews.reduce((n, p) => n + p.views!, 0)
      : null,
    boosted: posts.filter(boosted).length,
    adViews: posts.reduce((n, p) => n + paidViews(p), 0),
  };
}

export type Recommendation = {
  key: string;
  /** A 3D icon name from the app's set. */
  icon:
    | "rocket"
    | "megaphone"
    | "camera"
    | "lightbulb"
    | "link"
    | "target"
    | "plug"
    | "calendar"
    | "eyes";
  title: string;
  /** English, then Taglish. */
  body: [string, string];
  action?: { label: string; href: string; external?: boolean };
};

export type AnalystInput = {
  posts: PostRow[];
  /** A Facebook Page is connected. */
  connected: boolean;
  /** Listings for sale, with their public page views in the last 30 days. */
  listings: Array<{
    id: string;
    name: string;
    isPublic: boolean;
    views30: number;
  }>;
  /** The plan includes the Video Ad Maker. */
  videoAds: boolean;
  now: Date;
};

const n = (v: number) => v.toLocaleString("en-PH");
const plural = (v: number, one: string, many = `${one}s`) =>
  `${n(v)} ${v === 1 ? one : many}`;
const KIND: Record<PostKind, string> = {
  text: "text post",
  photos: "photo post",
  video: "video",
};

/**
 * What to do next, most important first, at most five. Each one states the
 * numbers it rests on. Spending is always the owner's call: a boost is only
 * ever suggested, and the amount is theirs to set.
 */
export function recommendations({
  posts,
  connected,
  listings,
  videoAds,
  now,
}: AnalystInput): Recommendation[] {
  const recs: Recommendation[] = [];
  const used = new Set<string>();
  const add = (r: Recommendation, postId?: string) => {
    if (postId) {
      if (used.has(postId)) return;
      used.add(postId);
    }
    recs.push(r);
  };
  const byViews = [...listings].sort((a, b) => b.views30 - a.views30);

  if (!connected) {
    return [
      {
        key: "connect",
        icon: "plug",
        title: "Connect Your Facebook Page",
        body: [
          "Posts made from MyHomeSeller, and how each one does, show here once a Page is connected.",
          "Lalabas dito ang mga post na ginawa sa MyHomeSeller, at kung kumusta ang bawat isa, kapag may naka-connect nang Page.",
        ],
        action: { label: "Open Connections", href: "/app/integrations" },
      },
    ];
  }
  if (!posts.length) {
    const first = byViews[0];
    return first
      ? [
          {
            key: "first-post",
            icon: "megaphone",
            title: "Make Your First Post",
            body:
              first.views30 > 0
                ? [
                    `Nothing has been posted from MyHomeSeller in the last 90 days. Start with ${first.name}: its page had ${plural(first.views30, "view")} in the last 30 days, the most of your listings.`,
                    `Wala pang na-post mula sa MyHomeSeller nitong huling 90 araw. Simulan sa ${first.name}: may ${plural(first.views30, "view")} ang page nito nitong huling 30 araw, pinakamarami sa listings mo.`,
                  ]
                : [
                    `Nothing has been posted from MyHomeSeller in the last 90 days. Post ${first.name} to your Page to get its first views.`,
                    `Wala pang na-post mula sa MyHomeSeller nitong huling 90 araw. I-post ang ${first.name} sa Page mo para magkaroon ito ng unang views.`,
                  ],
            action: {
              label: "Open the Listing",
              href: `/app/properties/${first.id}`,
            },
          },
        ]
      : [];
  }

  const judged = verdicts(posts, now);
  const newest = [...posts].sort((a, b) =>
    b.postedAt.localeCompare(a.postedAt),
  );
  const where = (p: PostRow) =>
    p.listing ? `${p.listing.name}` : `your ${KIND[p.kind]}`;

  // 1. Boosted posts: is the spend bringing people who ask?
  for (const p of newest.filter(boosted)) {
    if (recs.length >= 2) break;
    const paid = paidViews(p);
    const leads = leadsAfter(p);
    if (leads >= 1) {
      add(
        {
          key: `boost-working:${p.id}`,
          icon: "rocket",
          title: "Your Boost Is Bringing Inquiries",
          body: [
            `The boosted post of ${where(p)} has ${plural(paid, "view")} from ads, and the listing got ${plural(p.after!.inquiries, "inquiry", "inquiries")} and ${plural(p.after!.chats, "chat")} in the ${plural(p.after!.days, "day")} after it. Check what you've spent in Meta Ads Manager and divide it by ${n(leads)}: that is your cost per inquiry. Keep it running while that cost is worth it to you.`,
            `May ${plural(paid, "view")} mula sa ads ang boosted post ng ${where(p)}, at nagkaroon ang listing ng ${plural(p.after!.inquiries, "inquiry", "inquiries")} at ${plural(p.after!.chats, "chat")} sa ${plural(p.after!.days, "araw", "araw")} pagkatapos. Tingnan sa Meta Ads Manager ang nagastos mo at i-divide sa ${n(leads)}: iyan ang cost per inquiry mo. Ituloy habang sulit pa sa'yo ang cost na iyan.`,
          ],
          action: p.permalink
            ? { label: "Open the Post", href: p.permalink, external: true }
            : undefined,
        },
        p.id,
      );
    } else if (ageDays(p, now) >= 3 && paid >= 300) {
      add(
        {
          key: `boost-no-leads:${p.id}`,
          icon: "target",
          title: "Your Boost Isn't Bringing Inquiries",
          body: [
            `The boosted post of ${where(p)} has ${plural(paid, "view")} from ads, and no inquiry or chat about the listing in the ${plural(p.after?.days ?? WINDOW_DAYS, "day")} after it. Pause the boost before spending more, then change the post: put the price and the place in the first line, and ask people to message you.`,
            `May ${plural(paid, "view")} mula sa ads ang boosted post ng ${where(p)}, pero walang inquiry o chat tungkol sa listing sa ${plural(p.after?.days ?? WINDOW_DAYS, "araw", "araw")} pagkatapos. I-pause muna ang boost bago gumastos pa, tapos baguhin ang post: ilagay ang presyo at lugar sa unang linya, at sabihing mag-message sa'yo.`,
          ],
          action: p.permalink
            ? { label: "Open the Post", href: p.permalink, external: true }
            : undefined,
        },
        p.id,
      );
    }
  }

  // 2. The best post that isn't boosted yet. The owner decides whether to spend, and how much.
  const best = newest
    .filter(
      (p) =>
        judged.get(p.id) === "working" &&
        !boosted(p) &&
        ageDays(p, now) <= 21 &&
        (!p.listing || p.listing.forSale),
    )
    .sort(
      (a, b) =>
        leadsAfter(b) - leadsAfter(a) || interactions(b)! - interactions(a)!,
    )[0];
  if (best) {
    const leads = leadsAfter(best);
    add(
      {
        key: `worth-boosting:${best.id}`,
        icon: "rocket",
        title: "This Post Is Worth Boosting",
        body: [
          `The ${KIND[best.kind]} of ${where(best)} is doing better than your other posts: ${plural(interactions(best)!, "reaction, comment and share", "reactions, comments and shares")}${leads ? `, and ${plural(leads, "inquiry or chat", "inquiries and chats")} after it` : ""}. If you want more people to see it, boost this one from your Page on Facebook. You choose the amount and the days.`,
          `Mas maganda ang takbo ng ${KIND[best.kind]} ng ${where(best)} kaysa sa iba mong posts: ${plural(interactions(best)!, "reaction, comment at share", "reactions, comments at shares")}${leads ? `, at ${plural(leads, "inquiry o chat", "inquiries at chats")} pagkatapos` : ""}. Kung gusto mong mas marami ang makakita, ito ang i-boost mula sa Page mo sa Facebook. Ikaw ang pipili ng amount at ilang araw.`,
        ],
        action: best.permalink
          ? { label: "Open the Post", href: best.permalink, external: true }
          : undefined,
      },
      best.id,
    );
  }

  // 3. Seen, but nobody asked.
  const seen = newest.find(
    (p) =>
      p.listing &&
      !boosted(p) &&
      ageDays(p, now) >= 3 &&
      leadsAfter(p) === 0 &&
      ((p.views ?? 0) >= 300 || (interactions(p) ?? 0) >= 15),
  );
  if (seen) {
    const what =
      seen.views !== null && seen.views >= 300
        ? plural(seen.views, "view")
        : plural(
            interactions(seen)!,
            "reaction, comment and share",
            "reactions, comments and shares",
          );
    const whatTl =
      seen.views !== null && seen.views >= 300
        ? plural(seen.views, "view")
        : plural(
            interactions(seen)!,
            "reaction, comment at share",
            "reactions, comments at shares",
          );
    add(
      seen.listing!.isPublic
        ? {
            key: `seen-not-asked:${seen.id}`,
            icon: "lightbulb",
            title: "People Saw It, Nobody Asked",
            body: [
              `The post of ${seen.listing!.name} has ${what}, and no inquiry or chat in the ${plural(seen.after?.days ?? WINDOW_DAYS, "day")} after it. Check that the price and the place are in the first line of the post, and reply to its comments with the listing's link.`,
              `May ${whatTl} ang post ng ${seen.listing!.name}, pero walang inquiry o chat sa ${plural(seen.after?.days ?? WINDOW_DAYS, "araw", "araw")} pagkatapos. Siguraduhing nasa unang linya ng post ang presyo at lugar, at i-reply sa comments ang link ng listing.`,
            ],
            action: {
              label: "Open the Listing",
              href: `/app/properties/${seen.listing!.id}`,
            },
          }
        : {
            key: `no-public-page:${seen.id}`,
            icon: "link",
            title: "Give This Listing a Public Page",
            body: [
              `The post of ${seen.listing!.name} has ${what}, but the listing has no public page, so the post has no link for buyers to open or send an inquiry from. Turn on "Give it a public page", then post it again.`,
              `May ${whatTl} ang post ng ${seen.listing!.name}, pero walang public page ang listing, kaya walang link sa post na mabubuksan ng buyers o mapagpapadalhan ng inquiry. I-on ang "Give it a public page", tapos i-post ulit.`,
            ],
            action: {
              label: "Open the Listing",
              href: `/app/properties/${seen.listing!.id}`,
            },
          },
      seen.id,
    );
  }

  // 4. A video people leave early.
  const short = newest.find(
    (p) =>
      p.video &&
      (p.video.plays ?? 0) >= 30 &&
      p.video.avgWatchMs !== null &&
      p.video.lengthMs !== null &&
      p.video.lengthMs >= 5000 &&
      p.video.avgWatchMs / p.video.lengthMs < 0.25,
  );
  if (short) {
    const watched = Math.round(short.video!.avgWatchMs! / 1000);
    const length = Math.round(short.video!.lengthMs! / 1000);
    add(
      {
        key: `leave-early:${short.id}`,
        icon: "camera",
        title: "Viewers Leave This Video Early",
        body: [
          `People watch ${plural(watched, "second")} of the ${n(length)}-second video of ${where(short)} on average, across ${plural(short.video!.plays!, "play")}. The opening isn't holding them. Make it again with a different opening${videoAds ? ' ("Show Me Another Version")' : ""} and lead with the price or the best photo.`,
          `Sa average, ${plural(watched, "second")} lang ng ${n(length)}-second video ng ${where(short)} ang napapanood, sa ${plural(short.video!.plays!, "play")}. Hindi sila nahahawakan ng opening. Gawin ulit na iba ang opening${videoAds ? ' ("Show Me Another Version")' : ""} at unahin ang presyo o ang pinakamagandang photo.`,
        ],
        action:
          videoAds && short.listing
            ? {
                label: "Make a New Video",
                href: `/app/video?property=${short.listing.id}`,
              }
            : undefined,
      },
      short.id,
    );
  }

  // 5. Videos against photo posts, once there are two of each to compare. Boosted posts are left out: ads would decide the answer.
  const read = posts.filter((p) => p.fb && !boosted(p));
  const videos = read
    .filter((p) => p.kind === "video")
    .map((p) => interactions(p)!);
  const photos = read
    .filter((p) => p.kind !== "video")
    .map((p) => interactions(p)!);
  if (videos.length >= 2 && photos.length >= 2) {
    const v = Math.round(median(videos));
    const ph = Math.round(median(photos));
    if (v >= 3 && v >= 1.5 * Math.max(ph, 1)) {
      const next = byViews.find(
        (l) => !posts.some((p) => p.kind === "video" && p.listing?.id === l.id),
      );
      recs.push({
        key: "videos-win",
        icon: "camera",
        title: "Your Videos Do Better Than Your Photos",
        body: [
          `A typical video of yours gets ${n(v)} reactions, comments and shares; a typical photo or text post gets ${n(ph)}.${next ? ` ${next.name} has no video yet.` : ""}`,
          `Ang karaniwang video mo ay may ${n(v)} reactions, comments at shares; ang karaniwang photo o text post ay ${n(ph)}.${next ? ` Wala pang video ang ${next.name}.` : ""}`,
        ],
        action:
          videoAds && next
            ? {
                label: "Make a Video Ad",
                href: `/app/video?property=${next.id}`,
              }
            : undefined,
      });
    } else if (ph >= 3 && ph >= 1.5 * Math.max(v, 1)) {
      recs.push({
        key: "photos-win",
        icon: "camera",
        title: "Your Photo Posts Do Better Than Your Videos",
        body: [
          `A typical photo or text post of yours gets ${n(ph)} reactions, comments and shares; a typical video gets ${n(v)}. Keep posting photos, and try a different template or opening on your next video.`,
          `Ang karaniwang photo o text post mo ay may ${n(ph)} reactions, comments at shares; ang karaniwang video ay ${n(v)}. Ituloy ang pag-post ng photos, at subukan ang ibang template o opening sa susunod mong video.`,
        ],
      });
    }
  }

  // 6. Listings for sale that were never posted.
  const never = byViews.filter(
    (l) => !posts.some((p) => p.listing?.id === l.id),
  );
  if (never.length) {
    const first = never[0]!;
    recs.push({
      key: "never-posted",
      icon: "megaphone",
      title:
        never.length === 1
          ? "One Listing Hasn't Been Posted"
          : `${n(never.length)} Listings Haven't Been Posted`,
      body: [
        `${never.length === 1 ? `${first.name} hasn't` : `${n(never.length)} of your ${n(listings.length)} listings for sale haven't`} been posted from MyHomeSeller in the last 90 days.${never.length > 1 ? ` Start with ${first.name}` : " Post it"}${first.views30 > 0 ? `: its page had ${plural(first.views30, "view")} in the last 30 days.` : "."}`,
        `${never.length === 1 ? `Hindi pa na-post ang ${first.name}` : `${n(never.length)} sa ${n(listings.length)} listings mong for sale ang hindi pa na-post`} mula sa MyHomeSeller nitong huling 90 araw.${never.length > 1 ? ` Simulan sa ${first.name}` : " I-post na ito"}${first.views30 > 0 ? `: may ${plural(first.views30, "view")} ang page nito nitong huling 30 araw.` : "."}`,
      ],
      action: {
        label: "Open the Listing",
        href: `/app/properties/${first.id}`,
      },
    });
  }

  // 7. Gone quiet.
  const last = ageDays(newest[0]!, now);
  if (last >= 14) {
    recs.push({
      key: "stale",
      icon: "calendar",
      title: "It's Been a While Since Your Last Post",
      body: [
        `Your last post from MyHomeSeller was ${n(last)} days ago. A Page that posts every week stays in front of buyers; post one listing this week.`,
        `${n(last)} araw na ang nakalipas mula sa huli mong post sa MyHomeSeller. Mas nakikita ng buyers ang Page na nagpo-post linggo-linggo; mag-post ng isang listing ngayong linggo.`,
      ],
      action: byViews[0]
        ? {
            label: "Open the Listing",
            href: `/app/properties/${byViews[0].id}`,
          }
        : undefined,
    });
  }

  return recs.slice(0, 5);
}

const manilaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * A listing's own numbers around one post: page views on the 7 Manila days
 * from the day of the post and on the 7 days before it, and the inquiries and
 * chats that arrived in the 7 days after the post went up. For a newer post
 * the window is the days so far.
 */
export function afterNumbers(
  postedAt: string,
  now: Date,
  viewsByDay: ReadonlyMap<string, number>,
  inquiries: readonly string[],
  chats: readonly string[],
): NonNullable<PostRow["after"]> {
  const start = new Date(postedAt).getTime();
  const end = Math.min(now.getTime(), start + WINDOW_DAYS * DAY);
  const days = Math.min(
    WINDOW_DAYS,
    Math.floor((now.getTime() - start) / DAY) + 1,
  );
  let views = 0;
  let viewsBefore = 0;
  for (let i = 0; i < WINDOW_DAYS; i++) {
    if (i < days)
      views += viewsByDay.get(manilaDay.format(new Date(start + i * DAY))) ?? 0;
    viewsBefore +=
      viewsByDay.get(manilaDay.format(new Date(start - (i + 1) * DAY))) ?? 0;
  }
  const within = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= start && t < end;
  };
  return {
    days: Math.max(1, days),
    views,
    viewsBefore,
    inquiries: inquiries.filter(within).length,
    chats: chats.filter(within).length,
  };
}

/**
 * How many of a listing's inquiries or chats arrived within 7 days after any
 * of its posts, each counted once however many posts' weeks it falls in.
 */
export function countAfterPosts(
  postTimes: readonly string[],
  events: readonly string[],
  now: Date,
): number {
  const windows = postTimes.map((t) => {
    const start = new Date(t).getTime();
    return [start, Math.min(now.getTime(), start + WINDOW_DAYS * DAY)] as const;
  });
  return events.filter((e) => {
    const t = new Date(e).getTime();
    return windows.some(([from, to]) => t >= from && t < to);
  }).length;
}
