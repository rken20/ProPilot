/** MyHomeSeller mark: a white tile with a blue roofline and a green door. `wordmark={false}` shows the tile alone. */
export function Logo({ className = "", tone = "light", wordmark = true }: { className?: string; tone?: "light" | "dark"; wordmark?: boolean }) {
  const tile = tone === "dark" ? "#ffffff" : "#1a62dc";
  const roof = tone === "dark" ? "#1a62dc" : "#ffffff";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-9" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill={tile} />
        <path d="M7.5 16.5 16 9l8.5 7.5" fill="none" stroke={roof} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 15v8h11v-8" fill="none" stroke={roof} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14.2" y="17.5" width="3.6" height="5.5" rx="1.2" fill="#12a356" />
      </svg>
      {wordmark ? <span className="whitespace-nowrap text-[18px] font-extrabold tracking-tight">MyHomeSeller</span> : null}
    </span>
  );
}
