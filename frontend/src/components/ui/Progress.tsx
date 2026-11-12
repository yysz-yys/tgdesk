import type { ElementType } from "react";
import "@material/web/progress/linear-progress.js";
import { cn } from "../../lib/cn";

const MdLinearProgress = "md-linear-progress" as unknown as ElementType;

export interface LinearProgressProps {
  value: number;
  max?: number;
  label?: string;
  indeterminate?: boolean;
  className?: string;
  tone?: "primary" | "error";
}

/** Material 3 linear progress indicator. `value` and `max` are numbers. */
export function LinearProgress({
  value,
  max = 1,
  label,
  indeterminate = false,
  className,
  tone = "primary",
}: LinearProgressProps) {
  return (
    <MdLinearProgress
      className={cn("g-linear-progress", className)}
      data-tone={tone}
      value={Math.max(0, Math.min(max, value))}
      max={max}
      indeterminate={indeterminate || undefined}
      aria-label={label}
    />
  );
}
