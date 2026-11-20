import { UserRound } from "lucide-react";
import { cx } from "@/components/ui";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** A person's profile photo, or their initials when they have none. Decorative: put the name beside it or on the link. */
export function Avatar({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- small square JPEG from storage, already sized
    return (
      <img
        src={url}
        alt=""
        width={256}
        height={256}
        loading="lazy"
        decoding="async"
        className={cx("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  const text = initials(name);
  return (
    <span
      aria-hidden
      className={cx(
        "grid shrink-0 place-items-center rounded-full font-bold",
        className,
      )}
    >
      {text || <UserRound className="size-[45%]" />}
    </span>
  );
}
