import type { ButtonHTMLAttributes } from "react";
import { useRipple } from "../../k/useRipple";

/**
 * Composer button with the Web K press ripple. Web K gives every `.btn-icon`
 * (and the plate buttons) the global ripple; `useRipple` injects the shared
 * `.c-ripple` layer before the content and marks the element `position:
 * relative`. Colours/duration come from the K root tokens (`--ripple-*`).
 */
export function ComposerButton({
  ripple = true,
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { ripple?: boolean }) {
  const { ref } = useRipple<HTMLButtonElement>(!ripple);
  return (
    <button ref={ref} type={type} className={className} {...rest}>
      {children}
    </button>
  );
}
