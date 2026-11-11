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
        <button className="flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-[background-color,border-color,transform] duration-200 hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98]">
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
