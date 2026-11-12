import type { ButtonHTMLAttributes, ElementType } from "react";
import "@material/web/button/filled-button.js";
import "@material/web/button/filled-tonal-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const TAGS: Record<ButtonVariant, string> = {
  filled: "md-filled-button",
  tonal: "md-filled-tonal-button",
  outlined: "md-outlined-button",
  text: "md-text-button",
  danger: "md-filled-button",
};

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  trailingIcon?: string;
  loading?: boolean;
  fullWidth?: boolean;
}

/**
 * Material 3 button. This is a thin React wrapper over Google's official
 * `@material/web` button elements, so ripple, focus ring, disabled state and
 * colour roles come from the Material implementation rather than being
 * re-created here.
 */
export function Button({
  variant = "filled",
  size = "md",
  icon,
  trailingIcon,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const Tag = TAGS[variant] as unknown as ElementType;
  return (
    <Tag
      {...props}
      type={type}
      className={cn("g-button", `g-button--${size}`, className)}
      data-variant={variant}
      data-fullwidth={fullWidth || undefined}
      data-loading={loading || undefined}
      disabled={disabled || loading}
    >
      {loading ? (
        <span className="g-button-progress" slot="icon">
          <Spinner size={18} />
        </span>
      ) : icon ? (
        <Icon name={icon} size={18} slot="icon" />
      ) : null}
      <span className="g-button-label">{children}</span>
      {trailingIcon ? <Icon name={trailingIcon} size={18} slot="trailing-icon" /> : null}
    </Tag>
  );
}
