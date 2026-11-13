import type { CSSProperties, ReactNode } from "react";
import { Dialog as RadixDialog } from "@radix-ui/themes";
import { cn } from "../lib/cn";
import { Icon } from "./Icon";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  hideDescription?: boolean;
  closeLabel: string;
  children: ReactNode;
  className?: string;
  width?: string;
  style?: CSSProperties;
}

/** Centred dialog atom: one title, optional description, a close affordance. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  hideDescription = false,
  closeLabel,
  children,
  className,
  width = "440px",
  style,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Content
        maxWidth={width}
        className={cn("f-dialog", className)}
        style={style}
      >
        <RadixDialog.Title size="4">{title}</RadixDialog.Title>
        {description ? (
          <RadixDialog.Description
            size="2"
            color="gray"
            mt="1"
            className={hideDescription ? "sr-only" : undefined}
          >
            {description}
          </RadixDialog.Description>
        ) : null}
        <div className="f-dialog-body">{children}</div>
        <RadixDialog.Close>
          <button type="button" className="f-dialog-close" aria-label={closeLabel}>
            <Icon name="close" size={15} />
          </button>
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Root>
  );
}
