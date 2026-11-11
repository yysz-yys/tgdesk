import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cn("menu-content", className)}>
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
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
    <ContextMenuPrimitive.Item
      className={cn("menu-item", danger && "text-[var(--tg-danger)]")}
      onSelect={onSelect}
      disabled={disabled}
    >
      {icon}
      <span>{children}</span>
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuSeparator() {
  return <ContextMenuPrimitive.Separator className="menu-separator" />;
}
