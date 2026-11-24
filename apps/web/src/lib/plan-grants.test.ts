import { describe, expect, it } from "vitest";
import { MAX_GRANT_EMAILS, grantLine, parseEmails } from "./plan-grants";

describe("the emails a super admin types", () => {
  it("are read from a pasted list, lower-cased and each kept once", () => {
    expect(
      parseEmails(
        "Ana@Example.com, ben@example.com;\n  cara@example.ph  ana@example.com",
      ),
    ).toEqual({
      emails: ["ana@example.com", "ben@example.com", "cara@example.ph"],
      invalid: [],
      tooMany: false,
    });
    expect(
      parseEmails('"Ana Cruz" <ana@example.com>, (ben@example.com).'),
    ).toEqual({
      emails: ["ana@example.com", "ben@example.com"],
      invalid: [],
      tooMany: false,
    });
  });

  it("reports what isn't an email instead of guessing", () => {
    expect(parseEmails("ana@example, @example.com, ben@example.com")).toEqual({
      emails: ["ben@example.com"],
      invalid: ["ana@example", "@example.com"],
      tooMany: false,
    });
    expect(parseEmails("hello")).toEqual({
      emails: [],
      invalid: ["hello"],
      tooMany: false,
    });
    expect(parseEmails("   ")).toEqual({
      emails: [],
      invalid: [],
      tooMany: false,
    });
  });

  it("takes a limited number at a time", () => {
    const many = Array.from(
      { length: MAX_GRANT_EMAILS + 3 },
      (_, i) => `t${i}@example.com`,
    ).join("\n");
    const parsed = parseEmails(many);
    expect(parsed.emails).toHaveLength(MAX_GRANT_EMAILS);
    expect(parsed.tooMany).toBe(true);
  });
});

describe("what happened to each email", () => {
  it("says whether the plan is on or waiting", () => {
    expect(
      grantLine(
        {
          email: "a@example.com",
          status: "applied",
          business: "Santos Realty",
          until: "Feb 24, 2027",
        },
        "Pro",
      ),
    ).toBe("Pro is on for Santos Realty, until Feb 24, 2027.");
    expect(
      grantLine({ email: "a@example.com", status: "waiting_business" }, "Pro"),
    ).toContain("no business of their own yet");
    expect(
      grantLine({ email: "a@example.com", status: "waiting_signup" }, "Agency"),
    ).toContain("Agency turns on when they sign up with this email");
    expect(
      grantLine({ email: "a@example.com", status: "failed" }, "Pro"),
    ).toContain("Couldn't");
  });
});
