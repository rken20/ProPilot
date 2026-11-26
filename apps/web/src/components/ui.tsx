import type { ComponentProps, ReactNode } from "react";
import { Icon3d, type Icon3dName } from "./icon-3d";

/** Small, dependency-free UI kit. Server-safe (no hooks). */

/** The dashboard's pastel tile colours. Every screen draws from the same six, so the app reads as one. */
export const TILES = {
  sky: "bg-tile-sky",
  mint: "bg-tile-mint",
  peach: "bg-tile-peach",
  lavender: "bg-tile-lavender",
  pink: "bg-tile-pink",
  lemon: "bg-tile-lemon",
  /** The panel bar's navy, for the pale icons (chat bubble, envelope) that fade on a pastel. */
  navy: "bg-frame-1",
} as const;
export type Tone = keyof typeof TILES;
/** The six pastels only: for tiles that carry dark text. */
export type Pastel = Exclude<Tone, "navy">;

/** A 3D icon on a pastel tile: the mark of a page, a section or an empty screen. It bounces a little when hovered. */
export function IconTile({ name, tone = "sky", size = 52, className }: { name: Icon3dName; tone?: Tone; size?: number; className?: string }) {
  return (
    <span className={cx("pp-bounce grid shrink-0 place-items-center rounded-[var(--radius-tile)]", TILES[tone], className)} style={{ width: size, height: size }}>
      <Icon3d name={name} size={Math.round(size * 0.62)} />
    </span>
  );
}

/** A heading with a small 3D icon, for sections and plain cards that have no Panel bar. */
export function IconTitle({
  icon,
  id,
  size = 22,
  className,
  children,
}: {
  icon: Icon3dName;
  id?: string;
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className={cx("flex items-center gap-2", className)}>
      <Icon3d name={icon} size={size} />
      <span className="min-w-0">{children}</span>
    </h2>
  );
}

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]", className)} {...props} />;
}

const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);

/** Title Case for headings, as on the dashboard: small words stay lowercase, and words with their own capitals (AI, GCash) are left alone. */
export function titleCase(text: string): string {
  return text
    .split(" ")
    .map((w, i) => (w !== w.toLowerCase() || (i > 0 && SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * A card with a navy title bar, the dashboard's panel. `flush` drops the body's
 * padding for lists and tables that run edge to edge.
 */
export function Panel({
  title,
  icon,
  icon3d,
  action,
  flush = false,
  className,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  /** A 3D icon beside the title, as on the dashboard. */
  icon3d?: Icon3dName;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("flex flex-col overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-card)]", className)}>
      <div className="flex items-center justify-between gap-3 bg-frame-1 px-5 py-3 text-white">
        <h2 className="flex min-w-0 items-center gap-2.5 text-base font-extrabold tracking-tight">
          {icon3d ? <Icon3d name={icon3d} size={26} /> : icon}
          <span className="truncate">{typeof title === "string" ? titleCase(title) : title}</span>
        </h2>
        {action}
      </div>
      {flush ? children : <div className="p-5 sm:p-6">{children}</div>}
    </section>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cx("block text-sm font-medium text-ink", className)} {...props} />;
}

const fieldBase =
  "mt-1.5 block w-full rounded-2xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm shadow-[0_1px_1px_rgb(42_23_96/0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-zinc-500 hover:border-zinc-400 focus:border-grape-500 focus:ring-4 focus:ring-grape-100";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, "min-h-28", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="pp-fade mt-1.5 text-sm text-red-700">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const buttonVariants = {
  /** The main action: the dashboard's blue pill. */
  primary:
    "bg-[#1565e6] text-white shadow-[0_8px_18px_-8px_rgb(21_101_230/0.8),inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-[#0f52c4] disabled:bg-[#1565e6]/60 disabled:shadow-none",
  /** The yellow call to action, as on the dashboard banner. One per screen at most. */
  sun: "bg-sun font-extrabold text-sun-ink shadow-[0_10px_22px_-10px_rgb(248_196_35/0.9)] hover:brightness-105",
  secondary: "border border-grape-100 bg-white text-grape-700 hover:border-grape-300 hover:bg-grape-50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-zinc-700 hover:bg-zinc-100",
  /** For navy panels. */
  inverse: "bg-[#fff] text-[#0c2563] hover:bg-[#eaf2ff]",
  inverseGhost: "text-white/85 hover:bg-white/10 hover:text-white",
} as const;

export function buttonClass(variant: keyof typeof buttonVariants = "primary", className?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-[background-color,border-color,transform,box-shadow] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
    buttonVariants[variant],
    className,
  );
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-brand-100 bg-tile-mint text-brand-700",
    info: "border-zinc-200 bg-zinc-50 text-zinc-700",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("pp-fade rounded-2xl border px-4 py-3 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "hot" }) {
  const tones = {
    neutral: "bg-grape-50 text-grape-700",
    brand: "bg-brand-50 text-brand-700",
    hot: "bg-hot-50 text-hot",
  };
  return <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function PageHeader({
  title,
  description,
  action,
  icon,
  icon3d,
  tone,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  /** The page's own 3D icon, on a pastel tile. */
  icon3d?: Icon3dName;
  tone?: Tone;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
        {icon3d ? <IconTile name={icon3d} tone={tone} /> : icon}
        <div className="min-w-0">
          <h1 className="text-[1.6rem] leading-tight font-extrabold tracking-tight text-ink sm:text-[1.9rem]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-xl text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/** A key number on a pastel tile with its 3D icon, as on the dashboard. */
export function StatTile({ icon, tone = "sky", label, value, note }: { icon: Icon3dName; tone?: Pastel; label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className={cx("pp-bounce flex flex-col items-start gap-2 rounded-[var(--radius-tile)] p-4 sm:flex-row sm:gap-3 sm:p-5", TILES[tone])}>
      <Icon3d name={icon} size={36} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink/80">{label}</p>
        <p className="mt-1.5 text-[1.75rem] leading-none font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
        {note ? <p className="mt-2 text-xs leading-snug text-ink/70">{note}</p> : null}
      </div>
    </div>
  );
}

/** What a screen shows when there is nothing on it yet: its icon, what goes here, and the next step. */
export function EmptyState({ icon, tone = "sky", title, children, action, className }: { icon: Icon3dName; tone?: Tone; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("grid place-items-center rounded-[1.5rem] border-2 border-dashed border-grape-100 bg-white/60 px-6 py-10 text-center", className)}>
      <div>
        <IconTile name={icon} tone={tone} size={64} className="mx-auto" />
        <p className="mt-3 text-lg font-bold text-ink">{title}</p>
        {children ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
