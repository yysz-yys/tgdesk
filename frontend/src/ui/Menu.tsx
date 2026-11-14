import type { ReactNode } from "react";
import { DropdownMenu as RadixMenu } from "@radix-ui/themes";
import { cn } from "../lib/cn";

export interface MenuProps {
  trigger: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

/**
 * Dropdown-menu atom. Radix' trigger is `asChild`, so the wrapper always hands
 * it one real button; screens only vary that button's class and content.
 */
export function Menu({
  trigger,
  triggerClassName,
  contentClassName,
  children,
  side = "bottom",
  align = "start",
}: MenuProps) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger>
        <button type="button" className={cn("f-menu-trigger", triggerClassName)}>
          {trigger}
        </button>
      </RadixMenu.Trigger>
      <RadixMenu.Content
        className={cn("f-menu-content", contentClassName)}
        side={side}
        align={align}
        sideOffset={6}
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Root>
  );
}

export const MenuLabel = RadixMenu.Label;
export const MenuSeparator = RadixMenu.Separator;
export const MenuItem = RadixMenu.Item;
export const MenuRadioGroup = RadixMenu.RadioGroup;
export const MenuRadioItem = RadixMenu.RadioItem;
