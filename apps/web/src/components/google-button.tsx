import { signInWithGoogle } from "@/app/(auth)/actions";
import { isGoogleEnabled } from "@/lib/auth-providers";

/**
 * "Continue with Google" plus the "or with email" divider, as a plain form post.
 * Renders nothing until Google sign-in is switched on in Supabase.
 */
export async function GoogleButton({
  as,
  next,
}: {
  as?: "buyer" | "agent";
  next?: string;
}) {
  if (!(await isGoogleEnabled())) return null;
  return (
    <>
      <form action={signInWithGoogle}>
        {as ? <input type="hidden" name="as" value={as} /> : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <button className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-surface">
          <span
            aria-hidden
            className="grid size-5 place-items-center rounded-full border border-line text-[11px] font-bold"
          >
            G
          </span>
          Continue with Google
        </button>
      </form>
      <OrDivider />
    </>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" />
      or with email
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
