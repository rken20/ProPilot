"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SITE_LANG_COOKIE, toLang } from "@/lib/lang";

/** Remember the language on this device, for the home and sign-in pages. */
export async function setSiteLang(form: FormData) {
  const lang = toLang(form.get("lang"));
  (await cookies()).set(SITE_LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });
  revalidatePath("/", "layout");
}
