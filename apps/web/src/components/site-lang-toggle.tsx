import { setSiteLang } from "@/app/lang-actions";
import { cx } from "@/components/ui";
import { LANG_LABEL, type Lang } from "@/lib/lang";

/** Taglish / English, for the pages shown before signing in. `tone` is the background it sits on. */
export function SiteLangToggle({
  lang,
  tone = "light",
}: {
  lang: Lang;
  tone?: "light" | "dark";
}) {
  return (
    <form
      action={setSiteLang}
      className="inline-flex items-center gap-1 text-sm"
      aria-label="Language"
    >
      {(["taglish", "english"] as const).map((l) => (
        <button
          key={l}
          type="submit"
          name="lang"
          value={l}
          aria-pressed={l === lang}
          className={cx(
            "rounded-full px-3 py-1 font-semibold transition-colors",
            l === lang
              ? tone === "dark"
                ? "bg-white/20 text-white"
                : "bg-grape-100 text-grape-800"
              : tone === "dark"
                ? "text-white/70 hover:text-white"
                : "text-muted hover:text-ink",
          )}
        >
          {LANG_LABEL[l]}
        </button>
      ))}
    </form>
  );
}
