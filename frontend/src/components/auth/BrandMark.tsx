import { cn } from "../../lib/cn";

/** tgdesk app mark. The PNG includes its own white rounded tile. */
export function BrandMark({
  size = 48,
  className,
  alt = "tgdesk",
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      className={cn("g-brand-mark", className)}
      src="/brand-192.png"
      width={size}
      height={size}
      alt={alt}
      draggable={false}
    />
  );
}
