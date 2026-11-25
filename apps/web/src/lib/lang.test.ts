import { describe, expect, it } from "vitest";
import { sayIn, toLang } from "./lang";

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
