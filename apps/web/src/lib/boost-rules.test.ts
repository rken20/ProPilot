import { describe, expect, it } from "vitest";
import { boostsIncluded, boostTargeting, checkPlan, costPerChat, pinOf, placeQueries, readBoostInsights, settledStatus, suggestedPlan } from "./boost-rules";

describe("boost plans", () => {
  it("are part of Pro and Agency only", () => {
    expect(["free", "basic", "pro", "agency"].map(boostsIncluded)).toEqual([false, false, true, true]);
  });

  it("suggest ₱300 a day for 5 days, or ₱500 a day for listings above ₱10 million", () => {
    expect(suggestedPlan(450_000_000)).toEqual({ dailyMinor: 30_000, days: 5 });
    expect(suggestedPlan(null)).toEqual({ dailyMinor: 30_000, days: 5 });
    expect(suggestedPlan(1_500_000_000)).toEqual({ dailyMinor: 50_000, days: 5 });
  });

  it("keep to the owner's limits", () => {
    expect(checkPlan("300", "5")).toEqual({ ok: true, dailyMinor: 30_000, days: 5, totalMinor: 150_000 });
    expect(checkPlan("₱1,000", 10)).toEqual({ ok: true, dailyMinor: 100_000, days: 10, totalMinor: 1_000_000 });
    expect(checkPlan("1001", 1)).toMatchObject({ ok: false });
    expect(checkPlan("99", 1)).toMatchObject({ ok: false });
    expect(checkPlan("800", 14)).toMatchObject({ ok: false, error: expect.stringContaining("₱10,000") });
    expect(checkPlan("300", 15)).toMatchObject({ ok: false });
    expect(checkPlan("300.5", 5)).toMatchObject({ ok: false });
  });
});

describe("the audience", () => {
  it("is everyone 18 and over, of every gender, within 20 km of the pin or the town", () => {
    expect(pinOf("10.7202, 122.5621")).toEqual({ lat: 10.7202, lng: 122.5621 });
    expect(pinOf("Jaro, Iloilo City")).toBeNull();
    const t = boostTargeting({ kind: "pin", lat: 10.72, lng: 122.56, label: "x" });
    expect(t).toEqual({
      geo_locations: { custom_locations: [{ latitude: 10.72, longitude: 122.56, radius: 20, distance_unit: "kilometer" }] },
      age_min: 18,
      age_max: 65,
      publisher_platforms: ["facebook"],
    });
    expect(boostTargeting({ kind: "city", key: "1566083", label: "Iloilo City" }).geo_locations).toEqual({ cities: [{ key: "1566083", radius: 20, distance_unit: "kilometer" }] });
    expect(JSON.stringify(t)).not.toMatch(/genders|interests/);
  });

  it("looks up the town before the province when there is no pin", () => {
    expect(placeQueries("Barangay Lanag, Pototan, Iloilo")).toEqual(["Pototan", "Iloilo"]);
    expect(placeQueries("Mandurriao, Iloilo City")).toEqual(["Iloilo City"]);
    expect(placeQueries("Bacolod")).toEqual(["Bacolod"]);
    expect(placeQueries("")).toEqual([]);
  });
});

describe("results", () => {
  it("read spend in pesos, reach and the chats started", () => {
    const r = readBoostInsights({
      spend: "512.30",
      impressions: "20431",
      reach: "15002",
      actions: [
        { action_type: "post_engagement", value: "300" },
        { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "14" },
      ],
    });
    expect(r).toEqual({ spendMinor: 51_230, impressions: 20_431, reach: 15_002, chats: 14 });
    expect(costPerChat(r)).toBe(3_659);
    expect(costPerChat({ spendMinor: 100, chats: 0 })).toBeNull();
    expect(readBoostInsights(undefined)).toEqual({ spendMinor: 0, impressions: 0, reach: 0, chats: 0 });
  });

  it("call an active boost finished once its end date passes", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    expect(settledStatus("active", "2026-11-30T00:00:00Z", now)).toBe("finished");
    expect(settledStatus("active", "2026-12-02T00:00:00Z", now)).toBe("active");
    expect(settledStatus("stopped", "2026-11-30T00:00:00Z", now)).toBe("stopped");
  });
});
