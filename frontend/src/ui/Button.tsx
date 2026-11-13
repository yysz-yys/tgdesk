import type { ComponentProps, ReactNode } from "react";
import { Button as RadixButton } from "@radix-ui/themes";
import { cn } from "../lib/cn";
import { Icon } from "./Icon";

export type ButtonVariant = "solid" | "soft" | "surface" | "outline" | "ghost" | "danger";

const VARIANTS = {
  solid: { variant: "solid", color: "indigo" },
  soft: { variant: "soft", color: "indigo" },
  surface: { variant: "surface", color: "gray" },
  outline: { variant: "outline", color: "gray" },
  ghost: { variant: "ghost", color: "gray" },
  danger: { variant: "solid", color: "red" },
} as const;

export interface ButtonProps
  extends Omit<ComponentProps<typeof RadixButton>, "variant" | "color"> {
  variant?: ButtonVariant;
  icon?: string;
  trailingIcon?: string;
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * Button atom. F uses one solid indigo primary, a quiet surface secondary and
 * ghost chrome; Radix Themes supplies focus rings, loading and disabled states.
 */
export function Button({
  variant = "solid",
  icon,
  trailingIcon,
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const look = VARIANTS[variant];
  return (
    <RadixButton
      {...props}
      variant={look.variant}
      color={look.color}
      className={cn("f-button", fullWidth && "f-button-full", className)}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={16} /> : null}
    </RadixButton>
  );
}
