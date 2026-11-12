import type { ElementType } from "react";
import "@material/web/fab/fab.js";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

const MdFab = "md-fab" as unknown as ElementType;

export interface FabProps {
  icon: string;
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "tertiary" | "surface";
  size?: "small" | "medium" | "large";
  lowered?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Material 3 floating action button. */
export function Fab({
  icon,
  label,
  onClick,
  variant = "primary",
  size = "small",
  lowered = false,
  disabled = false,
  className,
}: FabProps) {
  return (
    <MdFab
      className={cn("g-fab", className)}
      variant={variant}
      size={size}
      lowered={lowered || undefined}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={size === "small" ? 20 : 24} slot="icon" />
    </MdFab>
  );
}
