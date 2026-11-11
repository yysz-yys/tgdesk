import { IconLoader2 } from "@tabler/icons-react";
import { cn } from "../../lib/cn";

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <IconLoader2
      className={cn("tg-spinner", className)}
      size={size}
      stroke={2}
      aria-hidden="true"
    />
  );
}
