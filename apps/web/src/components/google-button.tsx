import { signInWithGoogle } from "@/app/(auth)/actions";

/** "Continue with Google" as a plain form post, so it works before any JS loads. */
export function GoogleButton({ as, next }: { as?: "buyer" | "agent"; next?: string }) {
  return (
    <form action={signInWithGoogle}>
      {as ? <input type="hidden" name="as" value={as} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-surface">
        <span aria-hidden className="grid size-5 place-items-center rounded-full border border-line text-[11px] font-bold">
          G
        </span>
        Continue with Google
      </button>
    </form>
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
