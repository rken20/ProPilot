/**
 * MyHomeSeller mark, taken from the emblem on the mascot's chest: a gold house
 * outline with a chimney and a small blue house inside, on a white tile.
 * `tone="dark"` is for navy backgrounds; on light ones the tile gets a thin edge.
 * `wordmark={false}` shows the tile alone. The app icons in public/icons/app use
 * the same drawing.
 */
export function Logo({ className = "", tone = "light", wordmark = true }: { className?: string; tone?: "light" | "dark"; wordmark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 64 64" className="size-9 shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="62" height="62" rx="18" fill="#ffffff" stroke={tone === "dark" ? "none" : "#d6e5ff"} strokeWidth="2" />
        <g transform="translate(3.2 3.8) scale(0.9)">
          <rect x="14.6" y="12.5" width="6.4" height="13" rx="2" fill="#f39a1e" />
          <path d="M16.6 31.5V49.6M47.4 31.5V49.6" fill="none" stroke="#f6b40e" strokeWidth="5.4" strokeLinecap="round" />
          <path d="M8.8 31.6 32 11.6l23.2 20" fill="none" stroke="#f9bf1a" strokeWidth="6.2" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M32 26.3a2 2 0 0 1 1.3.5l8.6 7.4a1.6 1.6 0 0 1-1 2.8h-.6v11.6a1.9 1.9 0 0 1-1.9 1.9h-3.2v-7.3a3.2 3.2 0 0 0-6.4 0v7.3h-3.2a1.9 1.9 0 0 1-1.9-1.9V37h-.6a1.6 1.6 0 0 1-1-2.8l8.6-7.4a2 2 0 0 1 1.3-.5Z"
            fill="#1f6fe5"
          />
          <circle cx="32" cy="33.6" r="1.5" fill="#fff" />
        </g>
      </svg>
      {wordmark ? <span className="whitespace-nowrap text-[18px] font-extrabold tracking-tight">MyHomeSeller</span> : null}
    </span>
  );
}
