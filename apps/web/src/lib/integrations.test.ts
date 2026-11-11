import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";
import { authUrl, packEventRef, unpackEventRef, writeSheet, insertEvent, deleteEvent, GOOGLE_SCOPES } from "./google";
import { googleCalendarUrl, isoToManilaInput, leadRow, manilaInputToIso, newLeadEmail, toCsv, type Lead } from "./leads";

const lead: Lead = {
  id: "l1",
  buyer_name: "Ana <Santos>",
  buyer_phone: "0917 123 4567",
  preferred_date: "2026-11-20",
  budget_note: "Pag-IBIG, around ₱5M",
  message: "=HYPERLINK(\"http://evil\")",
  status: "new",
  agent_note: null,
  scheduled_at: null,
  created_at: "2026-11-11T02:30:00Z",
};
const property = { name: "2BR Unit 12A", location: "Mandurriao, Iloilo City" };

describe("token encryption", () => {
  const k = randomBytes(32).toString("base64");
  it("round-trips and never stores the plain token", () => {
    const box = encryptSecret("1//refresh-token", k);
    expect(box.startsWith("v1.")).toBe(true);
    expect(box).not.toContain("refresh-token");
    expect(decryptSecret(box, k)).toBe("1//refresh-token");
  });
  it("rejects tampering and the wrong key", () => {
    const box = encryptSecret("secret", k);
    const parts = box.split(".");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("x").toString("base64url")].join(".");
    expect(() => decryptSecret(tampered, k)).toThrow();
    expect(() => decryptSecret(box, randomBytes(32).toString("base64"))).toThrow();
  });
  it("requires a 32-byte key", () => {
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("Manila time", () => {
  it("reads a datetime-local value as UTC+8 and back", () => {
    expect(manilaInputToIso("2026-11-20T10:00")).toBe("2026-11-20T02:00:00.000Z");
    expect(isoToManilaInput("2026-11-20T02:00:00.000Z")).toBe("2026-11-20T10:00");
    expect(manilaInputToIso("tomorrow")).toBeNull();
  });
});

describe("Google Calendar link", () => {
  it("makes an all-day event on the preferred date", () => {
    const u = new URL(googleCalendarUrl(lead, property));
    expect(u.hostname).toBe("calendar.google.com");
    expect(u.searchParams.get("dates")).toBe("20261120/20261121");
    expect(u.searchParams.get("text")).toBe("Viewing: 2BR Unit 12A with Ana <Santos>");
    expect(u.searchParams.get("details")).toContain("0917 123 4567");
  });
  it("uses the agent's viewing time for one hour when set", () => {
    const u = new URL(googleCalendarUrl({ ...lead, scheduled_at: "2026-11-20T02:00:00.000Z" }, property));
    expect(u.searchParams.get("dates")).toBe("20261120T020000Z/20261120T030000Z");
  });
});

describe("CSV export", () => {
  it("quotes, adds a BOM, and defuses formula-looking cells", () => {
    const csv = toCsv([["Name", "Message"], ["Ana, Jr.", '=HYPERLINK("x")'], ["+63917", "-5"], ["@cmd", "line1\nline2"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Ana, Jr."');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'+63917,'-5");
    expect(csv).toContain(`'@cmd,"line1\nline2"`);
  });
  it("builds one row per lead in the sheet's column order", () => {
    const row = leadRow(lead, property.name);
    expect(row).toHaveLength(10);
    expect(row.slice(1, 5)).toEqual(["Ana <Santos>", "0917 123 4567", "2BR Unit 12A", "2026-11-20"]);
    expect(row[6]).toBe("New");
  });
});

describe("new-lead email", () => {
  it("escapes the buyer's words in HTML and links to Buyer leads", () => {
    const m = newLeadEmail(lead, property, "Cruz Realty", "https://app.example/app/leads");
    expect(m.subject).toBe("New viewing request: 2BR Unit 12A");
    expect(m.html).toContain("Ana &lt;Santos&gt;");
    expect(m.html).not.toContain("<Santos>");
    expect(m.text).toContain("Mobile: 0917 123 4567");
    expect(m.html).toContain("https://app.example/app/leads");
  });
});

describe("Google API client", () => {
  it("asks only for the narrow scopes, offline", () => {
    const u = new URL(authUrl("cid", "https://app.example/api/google/callback", "st8"));
    expect(u.searchParams.get("scope")?.split(" ")).toEqual([...GOOGLE_SCOPES]);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe("st8");
  });

  it("clears then writes the Leads tab as RAW values", async () => {
    const f = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    await writeSheet(f as never, "tok", "sheet1", [["A"], ["1"]]);
    expect(f.mock.calls[0]![0]).toContain("/values/Leads!A%3AZ:clear");
    expect(f.mock.calls[1]![0]).toContain("valueInputOption=RAW");
    expect(JSON.parse(f.mock.calls[1]![1].body)).toEqual({ values: [["A"], ["1"]] });
  });

  it("creates a one-hour event in Manila time", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "ev1" }), { status: 200 }));
    const id = await insertEvent(f as never, "tok", "cal@group", { summary: "Viewing", location: "Iloilo", description: "", startIso: "2026-11-20T02:00:00.000Z" });
    expect(id).toBe("ev1");
    const body = JSON.parse(f.mock.calls[0]![1].body);
    expect(body.end.dateTime).toBe("2026-11-20T03:00:00.000Z");
    expect(body.start.timeZone).toBe("Asia/Manila");
  });

  it("treats an already-deleted event as done", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 410 }));
    await expect(deleteEvent(f as never, "tok", "cal", "ev")).resolves.toBeUndefined();
  });

  it("packs and unpacks event references", () => {
    expect(unpackEventRef(packEventRef("u1", "cal@group", "ev1"))).toEqual({ userId: "u1", calendarId: "cal@group", eventId: "ev1" });
    expect(unpackEventRef("garbage")).toBeNull();
    expect(unpackEventRef(null)).toBeNull();
  });
});
