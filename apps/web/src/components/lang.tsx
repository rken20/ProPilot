"use client";

import { createContext, useContext, type ReactNode } from "react";
import { sayIn, type Lang, type Say } from "@/lib/lang";

const LangContext = createContext<Lang>("taglish");

/** Gives the screens inside it the language to write in. */
export function LangProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: ReactNode;
}) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** In a client component: `const say = useSay()`, then `say("Saved.", "Na-save na.")`. */
export function useSay(): Say {
  return sayIn(useContext(LangContext));
}
