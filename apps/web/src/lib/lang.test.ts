import { describe, expect, it } from "vitest";
import { PLAN_COPY, planCopy, upgradeMessage } from "./plan-rules";
import { fieldErrorsFrom } from "./form";
import { grantLine } from "./plan-grants";
import { sayIn, toLang } from "./lang";
import { usageSentence } from "./usage-rules";
import { z } from "zod";

describe("the app's language", () => {
  it("is Taglish unless English was chosen", () => {
    expect(toLang("english")).toBe("english");
    expect(toLang("taglish")).toBe("taglish");
    expect(toLang(undefined)).toBe("taglish");
    expect(toLang("English")).toBe("taglish");
    expect(toLang(null)).toBe("taglish");
  });

  it("picks the wording for the language", () => {
    expect(sayIn("english")("Saved.", "Na-save na.")).toBe("Saved.");
    expect(sayIn("taglish")("Saved.", "Na-save na.")).toBe("Na-save na.");
  });
});


describe("wording that lives outside the screens", () => {
  const taglish = sayIn("taglish");
  const english = sayIn("english");

  it("keeps the plan lists the same length and the same numbers in both languages", () => {
    for (const code of Object.keys(PLAN_COPY)) {
      const en = planCopy("english")[code]!;
      const tl = planCopy("taglish")[code]!;
      expect(tl.includes).toHaveLength(en.includes.length);
      en.includes.forEach((line, i) => expect(tl.includes[i]!.match(/[\d,]+/g) ?? []).toEqual(line.match(/[\d,]+/g) ?? []));
      expect(Boolean(tl.excludes)).toBe(Boolean(en.excludes));
    }
    expect(planCopy("english")).toBe(PLAN_COPY);
  });

  it("says an allowance is low or used up in the business's language, with the same numbers", () => {
    const low = { key: "replies", used: 8_400, limit: 10_000, level: "low" } as const;
    expect(usageSentence(low, english)).toBe(usageSentence(low));
    expect(usageSentence(low, taglish)).toBe("AI replies: 8,400 sa 10,000 replies na ang nagamit ngayong buwan, 1,600 na lang ang natitira.");
    expect(usageSentence({ key: "videoAds", used: 10, limit: 10, level: "out" }, taglish)).toContain("nagamit na lahat ng 10 video ads");
  });

  it("translates the form rules' messages it knows and leaves the others", () => {
    const parsed = z.object({ name: z.string().min(2, "Enter your name"), age: z.number({ message: "Something new" }) }).safeParse({ name: "", age: "x" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(fieldErrorsFrom(parsed.error)).toEqual({ name: "Enter your name", age: "Something new" });
    expect(fieldErrorsFrom(parsed.error, taglish)).toEqual({ name: "Ilagay ang pangalan mo", age: "Something new" });
    expect(fieldErrorsFrom(parsed.error, english).name).toBe("Enter your name");
  });

  it("has the paid-plan message and the beta tester lines in both", () => {
    expect(upgradeMessage(english)).toContain("Basic plan");
    expect(upgradeMessage(taglish)).toContain("Kasama sa Basic plan");
    expect(grantLine({ email: "a@example.com", status: "applied", business: "Santos Realty", until: "Feb 24, 2027" }, "Pro", taglish)).toBe("Naka-on na ang Pro para sa Santos Realty, hanggang Feb 24, 2027.");
  });
});
