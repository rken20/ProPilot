import "server-only";
import { getOrigin } from "./auth";

export const GOOGLE_STATE_COOKIE = "pp_google_state";

/**
 * The redirect URI registered in Google Cloud. GOOGLE_REDIRECT_ORIGIN pins it to
 * one stable address (preview deployments have changing hostnames).
 */
export async function googleRedirectUri(): Promise<string> {
  const origin = process.env.GOOGLE_REDIRECT_ORIGIN?.replace(/\/$/, "") || (await getOrigin());
  return `${origin}/api/google/callback`;
}

/** Which server settings Connect Google still needs (names only, never values). */
export function missingGoogleSettings(): string[] {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
}
