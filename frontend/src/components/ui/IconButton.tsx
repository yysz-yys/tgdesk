import { forwardRef, type ButtonHTMLAttributes, type ElementType } from "react";
import "@material/web/iconbutton/icon-button.js";
import "@material/web/iconbutton/filled-icon-button.js";
import "@material/web/iconbutton/filled-tonal-icon-button.js";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";
import { Tip } from "./Tooltip";

export type IconButtonVariant = "standard" | "filled" | "tonal";

const TAGS: Record<IconButtonVariant, string> = {
  standard: "md-icon-button",
  filled: "md-filled-icon-button",
  tonal: "md-filled-tonal-icon-button",
};

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon: string;
  variant?: IconButtonVariant;
  active?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  iconSize?: number;
  tooltip?: boolean;
}

/**
 * Material 3 icon button with a tooltip. The tooltip is attached to a native
 * wrapper so Radix can manage hover/focus without relying on React event props
 * being forwarded into a custom element.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      icon,
      variant = "standard",
      active = false,
      side = "bottom",
      iconSize = 20,
      tooltip = true,
      className,
      disabled,
      ...props
    },
    ref,
  ) {
    const Tag = TAGS[variant] as unknown as ElementType;
    const button = (
      <Tag
        {...props}
        ref={ref}
        className={cn("g-icon-button", className)}
        data-active={active || undefined}
        aria-label={label}
        aria-pressed={active || undefined}
        disabled={disabled}
      >
        <Icon name={icon} size={iconSize} />
      </Tag>
    );

    if (!tooltip) {
      return button;
    }

    return (
      <Tip label={label} side={side}>
        <span className="g-icon-button-anchor">{button}</span>
      </Tip>
    );
  },
);
