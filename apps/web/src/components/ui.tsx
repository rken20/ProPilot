import type { ComponentProps, ReactNode } from "react";

/** Small, dependency-free UI kit. Server-safe (no hooks). */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cx("block text-sm font-medium text-ink", className)} {...props} />;
}

const fieldBase =
  "mt-1.5 block w-full rounded-2xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm shadow-[0_1px_1px_rgb(42_23_96/0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-zinc-500 hover:border-zinc-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100";

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
  primary:
    "bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgb(11_138_71/0.55),inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-brand-700 hover:shadow-[0_8px_20px_-6px_rgb(11_138_71/0.6)] disabled:bg-brand-600/60 disabled:shadow-none",
  secondary: "border border-grape-100 bg-white text-grape-700 hover:border-grape-300 hover:bg-grape-50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-zinc-700 hover:bg-zinc-100",
  /** For grape panels. */
  inverse: "bg-[#fff] text-[#3a2084] hover:bg-[#f2edfe]",
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
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        {icon}
        <div>
          <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight text-ink">{title}</h1>
          {description ? <p className="mt-1.5 max-w-xl text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
