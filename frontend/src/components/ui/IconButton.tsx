import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Tip } from "./Tooltip";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active = false, children, className, side = "bottom", ...props },
  ref,
) {
  return (
    <Tip label={label} side={side}>
      <button
        ref={ref}
        type="button"
        className={cn("icon-button", className)}
        data-active={active}
        aria-label={label}
        {...props}
      >
        {children}
      </button>
    </Tip>
  );
});
