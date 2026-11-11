import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  children,
  align = "start",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={cn("menu-content", className)} align={align} sideOffset={6}>
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
}: {
  children: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      className={cn("menu-item", danger && "text-[var(--tg-danger)]")}
      onSelect={onSelect}
      disabled={disabled}
    >
      {icon}
      <span>{children}</span>
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="menu-separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="menu-label">{children}</DropdownMenu.Label>;
}
