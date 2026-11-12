import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  children,
  align = "start",
  side = "bottom",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className={cn("g-menu", className)}
        align={align}
        side={side}
        sideOffset={6}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  children,
  icon,
  onSelect,
  disabled = false,
  danger = false,
  selected = false,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  selected?: boolean;
}) {
  return (
    <DropdownMenu.Item
      className="g-menu-item"
      data-danger={danger || undefined}
      data-selected={selected || undefined}
      onSelect={onSelect}
      disabled={disabled}
    >
      {icon ? <span className="g-menu-icon">{icon}</span> : null}
      <span className="g-menu-label">{children}</span>
      {selected ? <Icon name="check" size={18} className="g-menu-check" /> : null}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="g-menu-separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="g-menu-label-section">{children}</DropdownMenu.Label>;
}
