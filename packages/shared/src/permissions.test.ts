import { describe, expect, it } from "vitest";
import { ACTIONS, BUSINESS_ROLES, can, canAssignRole } from "./permissions";
import { checkEntitlement, hasPaidAccess } from "./entitlements";
import { propertySchema, signUpSchema } from "./schemas";

describe("can()", () => {
  it("gives owners every action", () => {
    for (const action of ACTIONS) expect(can("owner", action)).toBe(true);
  });

  it("keeps billing and business deletion with the owner only", () => {
    for (const role of BUSINESS_ROLES.filter((r) => r !== "owner")) {
      expect(can(role, "billing.manage")).toBe(false);
      expect(can(role, "business.delete")).toBe(false);
    }
  });

  it("limits agents to their assigned leads", () => {
    expect(can("agent", "lead.viewAssigned")).toBe(true);
    expect(can("agent", "lead.viewAll")).toBe(false);
    expect(can("agent", "team.invite")).toBe(false);
  });

  it("lets marketing publish content but not touch leads", () => {
    expect(can("marketing", "content.publish")).toBe(true);
    expect(can("marketing", "lead.viewAssigned")).toBe(false);
    expect(can("marketing", "conversation.reply")).toBe(false);
  });

  it("denies everything without a role", () => {
    expect(can(null, "property.view")).toBe(false);
    expect(can(undefined, "business.view")).toBe(false);
  });
});

describe("canAssignRole()", () => {
  it("lets only owners create admins or owners", () => {
    expect(canAssignRole("owner", "admin")).toBe(true);
    expect(canAssignRole("admin", "admin")).toBe(false);
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "agent")).toBe(true);
    expect(canAssignRole("agent", "agent")).toBe(false);
  });
});

describe("checkEntitlement()", () => {
  const ents = { seats: 3, facebook_pages: null, ai_reports: 0 };

  it("allows usage under the limit and reports what remains", () => {
    expect(checkEntitlement(ents, "seats", 1)).toEqual({ allowed: true, remaining: 1 });
  });

  it("blocks usage at the limit", () => {
    expect(checkEntitlement(ents, "seats", 3)).toEqual({
      allowed: false,
      reason: "limit_reached",
      limit: 3,
    });
  });

  it("treats null as unlimited", () => {
    expect(checkEntitlement(ents, "facebook_pages", 999)).toEqual({ allowed: true, remaining: null });
  });

  it("treats 0 or a missing key as not included", () => {
    expect(checkEntitlement(ents, "ai_reports", 0)).toMatchObject({ allowed: false, reason: "not_included" });
    expect(checkEntitlement(ents, "ai_video_generations", 0)).toMatchObject({ allowed: false, reason: "not_included" });
  });
});

describe("hasPaidAccess()", () => {
  it("unlocks only trialing, active and grace", () => {
    expect(hasPaidAccess("active")).toBe(true);
    expect(hasPaidAccess("grace")).toBe(true);
    expect(hasPaidAccess("past_due")).toBe(false);
    expect(hasPaidAccess("restricted")).toBe(false);
  });
});

describe("schemas", () => {
  it("rejects short passwords and normalises email", () => {
    expect(signUpSchema.safeParse({ fullName: "Ana Cruz", email: "a@b.co", password: "short" }).success).toBe(false);
    const ok = signUpSchema.parse({ fullName: "Ana Cruz", email: " Ana@Example.COM ", password: "long-enough-pass" });
    expect(ok.email).toBe("ana@example.com");
  });

  it("requires integer centavos for prices", () => {
    const base = { name: "Unit 12A", type: "condominium", location: "Iloilo City" };
    expect(propertySchema.safeParse({ ...base, price: { amountMinor: 450000000 } }).success).toBe(true);
    expect(propertySchema.safeParse({ ...base, price: { amountMinor: 4500.5 } }).success).toBe(false);
  });
});

import { viewingRequestSchema } from "./schemas";

describe("viewingRequestSchema", () => {
  const base = { propertyId: "6f1c2b9e-1d2c-4c8a-9a51-6b2f8a1e3c44", buyerName: "Ana Cruz" };
  it("accepts PH mobile formats", () => {
    for (const phone of ["09171234567", "0917 123 4567", "+63 917 123 4567"]) {
      expect(viewingRequestSchema.safeParse({ ...base, buyerPhone: phone }).success).toBe(true);
    }
  });
  it("rejects junk phone numbers and bad dates", () => {
    expect(viewingRequestSchema.safeParse({ ...base, buyerPhone: "call me" }).success).toBe(false);
    expect(viewingRequestSchema.safeParse({ ...base, buyerPhone: "09171234567", preferredDate: "next week" }).success).toBe(false);
  });
  it("defaults sign-up to the agent account type", () => {
    expect(signUpSchema.parse({ fullName: "Ana Cruz", email: "a@b.co", password: "long-enough-pass" }).accountType).toBe("agent");
  });
});
