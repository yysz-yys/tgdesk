import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

/** Material 3 snackbar-style transient message. */
export function Toast({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("g-snackbar", className)} role="status" aria-live="polite">
      <Icon name="info" size={18} />
      <span>{message}</span>
    </div>
  );
}
