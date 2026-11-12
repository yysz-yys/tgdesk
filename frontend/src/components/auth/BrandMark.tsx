import { cn } from "../../lib/cn";

/**
 * Brand mark: the tgdesk app logo. Renders the squircle logo image at the
 * requested size; sizing is driven by the caller, rounding comes from CSS.
 */
export function BrandMark({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <img
      className={cn("tg-brand-mark", className)}
      src="/brand-192.png"
      width={size}
      height={size}
      alt="tgdesk"
      draggable={false}
    />
  );
}
