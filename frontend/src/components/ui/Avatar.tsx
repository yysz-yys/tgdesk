import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";

interface AvatarProps {
  title: string;
  initials: string;
  color: string;
  size?: number;
  online?: boolean;
  className?: string;
}

/** Google-style account/chat avatar with deterministic tonal colour. */
export function Avatar({
  title,
  initials,
  color,
  size = 40,
  online = false,
  className,
}: AvatarProps) {
  return (
    <span
      className={cn("g-avatar", className)}
      style={
        {
          "--avatar-size": `${size}px`,
          "--avatar-color": color,
          "--avatar-font-size": `${Math.max(11, Math.round(size * 0.36))}px`,
        } as CSSProperties
      }
      title={title}
      aria-hidden="true"
    >
      <span className="g-avatar-initials">{initials}</span>
      {online ? <span className="g-avatar-online" /> : null}
    </span>
  );
}
