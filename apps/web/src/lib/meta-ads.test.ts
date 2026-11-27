import { describe, expect, it, vi } from "vitest";
import { boostTargeting } from "./boost-rules";
import { metaConfig } from "./meta";
import { adAccounts, BoostError, campaignResults, createBoost, grantedPermissions } from "./meta-ads";

const cfg = metaConfig({ META_APP_ID: "1127327303375070", META_APP_SECRET: "secret" })!;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; body: Record<string, string> };
function fakeFetch(answer: (c: Call, i: number) => Response) {
  const calls: Call[] = [];
  const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : {};
    const c = { url, body };
    calls.push(c);
    return answer(c, calls.length - 1);
  });
  return { f: f as unknown as typeof fetch, calls };
}

const spec = {
  accountId: "555",
  pageId: "111",
  videoId: "777",
  thumbnailUrl: "https://scontent.example/thumb.jpg",
  message: "2BR condo in Mandurriao, ₱5.2M. Message us to view.",
  name: "MyHomeSeller boost",
  dailyMinor: 30_000,
  startsAt: new Date("2026-11-28T00:00:00Z"),
  endsAt: new Date("2026-12-03T00:00:00Z"),
  targeting: boostTargeting({ kind: "pin", lat: 10.72, lng: 122.56, label: "Mandurriao" }),
};

describe("creating a boost", () => {
  it("creates the campaign, ad set, creative and ad paused, then switches them on", async () => {
    const { f, calls } = fakeFetch((_c, i) => json({ id: String(900 + i), success: true }));
    const ids = await createBoost(f, cfg, "user-token", spec);
    expect(ids).toEqual({ campaignId: "900", adsetId: "901", creativeId: "902", adId: "903" });
    const [campaign, adset, creative, ad, ...on] = calls;
    expect(campaign!.url).toContain("/act_555/campaigns");
    expect(campaign!.body).toMatchObject({ objective: "OUTCOME_ENGAGEMENT", status: "PAUSED", special_ad_categories: '["HOUSING"]', is_adset_budget_sharing_enabled: "false" });
    expect(adset!.body).toMatchObject({ destination_type: "MESSENGER", optimization_goal: "CONVERSATIONS", daily_budget: "30000", status: "PAUSED", campaign_id: "900" });
    expect(JSON.parse(adset!.body.promoted_object!)).toEqual({ page_id: "111" });
    const story = JSON.parse(creative!.body.object_story_spec!);
    expect(story.video_data).toMatchObject({ video_id: "777", call_to_action: { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER" } } });
    expect(ad!.body).toMatchObject({ adset_id: "901", status: "PAUSED" });
    expect(on.map((c) => [c.url.split("/").pop()!.split("?")[0], c.body.status])).toEqual([
      ["903", "ACTIVE"],
      ["901", "ACTIVE"],
      ["900", "ACTIVE"],
    ]);
    // Every call is signed with the app secret proof, never the secret itself.
    expect(calls.every((c) => c.body.appsecret_proof && !JSON.stringify(c.body).includes("secret\""))).toBe(true);
  });

  it("deletes the campaign and reports what was made when a step fails, so nothing runs", async () => {
    const { f, calls } = fakeFetch((c, i) => (i === 2 ? json({ error: { message: "Invalid video", code: 100 } }, 400) : json({ id: String(900 + i), success: true })));
    const err = await createBoost(f, cfg, "user-token", spec).catch((e) => e);
    expect(err).toBeInstanceOf(BoostError);
    expect((err as BoostError).ids).toEqual({ campaignId: "900", adsetId: "901" });
    expect(calls.at(-1)!.url).toContain("/900");
    expect(calls.at(-1)!.body.status).toBe("DELETED");
    expect(calls.some((c) => c.body.status === "ACTIVE")).toBe(false);
  });
});

describe("reading from Meta", () => {
  it("lists granted permissions and usable ad accounts", async () => {
    const { f } = fakeFetch((c) =>
      c.url.includes("me/permissions")
        ? json({ data: [{ permission: "ads_management", status: "granted" }, { permission: "ads_read", status: "declined" }] })
        : json({ data: [{ account_id: "555", name: "Main", currency: "PHP", account_status: 1 }, { account_id: "bad" }] }),
    );
    expect(await grantedPermissions(f, cfg, "t")).toEqual(["ads_management"]);
    expect(await adAccounts(f, cfg, "t")).toEqual([{ id: "555", name: "Main", currency: "PHP", active: true }]);
  });

  it("reads a campaign's spend and chats", async () => {
    const { f, calls } = fakeFetch(() => json({ data: [{ spend: "120.50", impressions: "4000", reach: "3100", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "3" }] }] }));
    expect(await campaignResults(f, cfg, "t", "900")).toEqual({ spendMinor: 12_050, impressions: 4000, reach: 3100, chats: 3 });
    expect(calls[0]!.url).toContain("/900/insights");
  });
});
