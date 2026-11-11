/**
 * Responsive photo from /public/images, exported as <name>-<width>.webp.
 * The home page and sign-in images are AI-generated mood shots, never shown
 * as a real listing.
 */
export function Photo({
  name,
  widths,
  sizes,
  className,
  priority,
}: {
  name: string;
  widths: number[];
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const largest = widths[widths.length - 1];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static, pre-sized WebP files
    <img
      src={`/images/${name}-${largest}.webp`}
      srcSet={widths.map((w) => `/images/${name}-${w}.webp ${w}w`).join(", ")}
      sizes={sizes}
      alt=""
      className={className}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}
