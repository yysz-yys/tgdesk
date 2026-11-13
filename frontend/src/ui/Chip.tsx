import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface ChipProps {
  active?: boolean;
  count?: number;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Filter chip atom used by the conversation list and future panes. */
export function Chip({ active = false, count, children, onClick, className }: ChipProps) {
  return (
    <button
      type="button"
      className={cn("f-chip", className)}
      data-active={active || undefined}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="f-chip-label">{children}</span>
      {count !== undefined ? <span className="f-chip-count">{count}</span> : null}
    </button>
  );
}
