import { cn } from "../lib/cn";
import { Icon } from "./Icon";

/** Transient F toast, rendered at the bottom centre of the window. */
export function Toast({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("f-toast", className)} role="status" aria-live="polite">
      <Icon name="info" size={15} />
      <span>{message}</span>
    </div>
  );
}
