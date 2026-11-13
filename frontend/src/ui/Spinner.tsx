import { Spinner as RadixSpinner } from "@radix-ui/themes";
import { cn } from "../lib/cn";

export interface SpinnerProps {
  /** Pixel size kept from the Material API; mapped onto Radix' three sizes. */
  size?: number;
  label?: string;
  className?: string;
}

export function Spinner({ size = 18, label, className }: SpinnerProps) {
  const radixSize = size <= 16 ? "1" : size <= 20 ? "2" : "3";
  return (
    <span
      className={cn("f-spinner", className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <RadixSpinner size={radixSize} />
    </span>
  );
}

export const CircularProgress = Spinner;
