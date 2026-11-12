import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";

export interface IconProps {
  name: string;
  size?: number;
  filled?: boolean;
  weight?: 400 | 500;
  className?: string;
  style?: CSSProperties;
  slot?: string;
  label?: string;
}

/**
 * Material Symbols Rounded icon. The glyph is selected through the font's
 * ligature feature, matching the icon set used across Google Workspace.
 */
export function Icon({
  name,
  size = 20,
  filled = false,
  weight = 400,
  className,
  style,
  slot,
  label,
}: IconProps) {
  return (
    <span
      className={cn("g-icon", className)}
      style={{ fontSize: size, ...style }}
      data-filled={filled || undefined}
      data-weight={weight === 500 ? "500" : undefined}
      slot={slot}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {name}
    </span>
  );
}
