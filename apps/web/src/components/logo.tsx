/** ProPilot mark: a roofline that doubles as a navigation chevron. */
export function Logo({ className = "", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const tile = tone === "dark" ? "#f6f5f2" : "#24543f";
  const roof = tone === "dark" ? "#24543f" : "#ffffff";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill={tile} />
        <path d="M8 17.5 16 10l8 7.5" fill="none" stroke={roof} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.5 16v6.5h9V16" fill="none" stroke="#c9a463" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="whitespace-nowrap text-[17px] font-bold tracking-tight">ProPilot AI</span>
    </span>
  );
}
