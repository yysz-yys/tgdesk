import type { ComponentProps } from "react";
import { IconButton as RadixIconButton, Tooltip } from "@radix-ui/themes";
import { cn } from "../lib/cn";
import { Icon } from "./Icon";

export interface IconButtonProps
  extends Omit<ComponentProps<typeof RadixIconButton>, "children"> {
  label: string;
  icon: string;
  iconSize?: number;
  side?: "top" | "right" | "bottom" | "left";
  tooltip?: boolean;
}

/** Icon-only atom with the accessible label doubling as its tooltip. */
export function IconButton({
  label,
  icon,
  iconSize,
  side = "bottom",
  tooltip = true,
  variant = "ghost",
  color = "gray",
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <RadixIconButton
      {...props}
      aria-label={label}
      variant={variant}
      color={color}
      className={cn("f-icon-button", className)}
    >
      <Icon name={icon} size={iconSize ?? (props.size === "1" ? 14 : 16)} />
    </RadixIconButton>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <Tooltip content={label} side={side}>
      {button}
    </Tooltip>
  );
}
