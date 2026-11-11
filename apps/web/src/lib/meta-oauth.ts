import "server-only";
import { getOrigin } from "./auth";
import { metaConfig } from "./meta";

export const META_STATE_COOKIE = "pp_meta_state";

/** One stable address registered in the Meta app (preview deployments change hostnames). */
export async function metaOrigin(): Promise<string> {
  return process.env.META_REDIRECT_ORIGIN?.replace(/\/$/, "") || (await getOrigin());
}

export async function metaRedirectUri(): Promise<string> {
  return `${await metaOrigin()}/api/meta/callback`;
}

/** Which server settings Connect Facebook still needs (names only, never values). */
export function missingMetaSettings(): string[] {
  const missing = ["TOKEN_ENCRYPTION_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (!metaConfig()) missing.unshift("META_APP_ID", "META_APP_SECRET");
  return missing;
}
