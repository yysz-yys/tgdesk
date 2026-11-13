import { Progress as RadixProgress } from "@radix-ui/themes";
import { cn } from "../lib/cn";

export interface ProgressProps {
  /** 0..1, matching the old LinearProgress API. */
  value: number;
  tone?: "accent" | "error";
  label?: string;
  className?: string;
}

export function Progress({ value, tone = "accent", label, className }: ProgressProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <RadixProgress
      className={cn("f-progress", className)}
      value={percent}
      size="1"
      color={tone === "error" ? "red" : "indigo"}
      aria-label={label}
    />
  );
}
