import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { BUSINESS_COOKIE, getMemberships, requireBusiness } from "@/lib/auth";
import {
  SITE_LANG_COOKIE,
  sayIn,
  toLang,
  type Lang,
  type Say,
} from "@/lib/lang";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** The language a business chose, read once per request. Taglish until they choose English. */
export const businessLang = cache(async (businessId: string): Promise<Lang> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_settings")
    .select("chat_language")
    .eq("business_id", businessId)
    .maybeSingle();
  return toLang(data?.chat_language);
});

/** For a signed-in screen: the current business's language. */
export async function appLang(): Promise<Lang> {
  return businessLang((await requireBusiness()).businessId);
}

/** For a signed-in screen: `const say = await appSay()`. */
export async function appSay(): Promise<Say> {
  return sayIn(await appLang());
}

/** For a public listing page, which no signed-in person is reading: the seller's language. */
export const sellerLang = cache(async (businessId: string): Promise<Lang> => {
  const admin = createAdminClient();
  if (!admin) return "taglish";
  const { data } = await admin
    .from("agent_settings")
    .select("chat_language")
    .eq("business_id", businessId)
    .maybeSingle();
  return toLang(data?.chat_language);
});

/** For pages shown before signing in (home, sign-in): what this device last chose. */
export async function siteLang(): Promise<Lang> {
  return toLang((await cookies()).get(SITE_LANG_COOKIE)?.value);
}

export async function siteSay(): Promise<Say> {
  return sayIn(await siteLang());
}

/**
 * For a signed-in screen outside the app's own pages (the admin screens): the
 * person's business language, or the device's if they have no business. Never redirects.
 */
export async function userLang(): Promise<Lang> {
  const memberships = await getMemberships();
  if (!memberships.length) return siteLang();
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  return businessLang(
    (memberships.find((m) => m.businessId === chosen) ?? memberships[0]!)
      .businessId,
  );
}
