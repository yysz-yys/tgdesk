import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export interface SheetProps {
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
 * Accessible Material 3 side sheet built on Radix Dialog. Focus trapping,
 * escape-to-close and inert background behaviour stay with Radix; the surface
 * itself uses the shared M3 tokens.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  className,
  width = 480,
}: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Material's select renders its menu outside the dialog's React tree. Without
  // this capture handler Escape closes the whole sheet while the select menu is
  // still open, which loses the user's place.
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="g-scrim" />
        <Dialog.Content
          ref={contentRef}
          tabIndex={-1}
          className={cn("g-sheet", className)}
          style={{ width: `min(${width}px, 100vw)` }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus({ preventScroll: true });
          }}
        >
          <header className="g-sheet-header">
            <div className="g-sheet-heading">
              <Dialog.Title className="g-sheet-title">{title}</Dialog.Title>
              <Dialog.Description className="sr-only">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="g-sheet-close" aria-label={closeLabel}>
                <Icon name="close" size={21} />
              </button>
            </Dialog.Close>
          </header>
          <div className="g-sheet-scroll">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
