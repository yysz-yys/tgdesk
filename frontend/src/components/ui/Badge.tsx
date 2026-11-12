import { cn } from "../../lib/cn";

export function Badge({
  count,
  muted = false,
  className,
}: {
  count: number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("g-badge", className)} data-muted={muted || undefined}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
