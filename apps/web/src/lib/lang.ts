/**
 * The app's two languages. Taglish (English mixed with Tagalog) is the default;
 * a business can switch everything to English. One setting covers the app's
 * screens and the AI's chat replies: agent_settings.chat_language.
 *
 * Light Taglish: menu names, buttons, field labels and status names stay in
 * English. Sentences (descriptions, hints, notices, empty screens) are Taglish.
 */

export type Lang = "taglish" | "english";

export const LANG_LABEL: Record<Lang, string> = {
  taglish: "Taglish",
  english: "English",
};

/** Anything that isn't exactly "english" is Taglish, the default. */
export function toLang(value: unknown): Lang {
  return value === "english" ? "english" : "taglish";
}

/** Picks one of two wordings: `say("Saved.", "Na-save na.")`. */
export type Say = (english: string, taglish: string) => string;

export function sayIn(lang: Lang): Say {
  return lang === "english"
    ? (english) => english
    : (_english, taglish) => taglish;
}

/** Remembers the language on this device for pages shown before signing in. */
export const SITE_LANG_COOKIE = "mhs_lang";
