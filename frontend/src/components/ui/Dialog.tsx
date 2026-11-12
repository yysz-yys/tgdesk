import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
  width?: number;
}

/**
 * Material 3 modal dialog built on Radix. It is portalled so opening a dialog
 * from a constrained card (for example proxy settings during sign-in) never
 * reflows or clips the card underneath.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  className,
  width = 420,
}: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Material selects render their menu outside the React dialog tree. Close the
  // menu first so Escape does not dismiss the whole dialog.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const openSelect = Array.from(
        document.querySelectorAll<HTMLElement>("md-outlined-select, md-select"),
      ).find((element) => (element as HTMLElement & { open?: boolean }).open);
      if (!openSelect) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      (openSelect as HTMLElement & { open: boolean }).open = false;
      window.requestAnimationFrame(() => openSelect.focus());
    };
    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="g-dialog-scrim" />
        <div className="g-dialog-layer">
          <DialogPrimitive.Content
            ref={contentRef}
            tabIndex={-1}
            className={cn("g-dialog", className)}
            style={{ width: `min(${width}px, calc(100vw - 32px))` }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              contentRef.current?.focus({ preventScroll: true });
            }}
          >
            <header className="g-dialog-header">
              <div className="g-dialog-heading">
                <DialogPrimitive.Title className="g-dialog-title">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="g-dialog-description">
                  {description}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button type="button" className="g-dialog-close" aria-label={closeLabel}>
                  <Icon name="close" size={20} />
                </button>
              </DialogPrimitive.Close>
            </header>
            <div className="g-dialog-body">{children}</div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
