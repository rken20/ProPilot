/**
 * Glossy 3D icons from Microsoft's Fluent Emoji (MIT license, see
 * public/icons/3d/LICENSE-fluentui-emoji.txt). 128px WebP files, drawn at any size up to that.
 */
export const ICONS_3D = [
  "bell", "calendar", "camera", "card", "chart", "chat", "clipboard", "envelope", "eyes", "gear",
  "handshake", "heart", "house", "houses", "key", "laptop", "lightbulb", "link", "megaphone", "memo", "money",
  "party", "phone", "pin", "plug", "robot", "rocket", "search", "sparkles", "target", "team", "trophy", "wave",
] as const;
export type Icon3dName = (typeof ICONS_3D)[number];

export function Icon3d({ name, size = 32, className, label }: { name: Icon3dName; size?: number; className?: string; label?: string }) {
  return (
    // Plain <img>: tiny static files, no need for the image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/3d/${name}.webp`}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`pp-icon3d shrink-0 select-none ${className ?? ""}`}
    />
  );
}
