/**
 * One-at-a-time hover/hold preview state for the sticker and GIF grids.
 *
 * Web K strategy (temp/research2/stickers-gifs.md §6): grid cells stay as still
 * thumbnails; the animation only exists in a single floating preview. Hover
 * shows it after a short delay (which also means press-and-hold on touch shows
 * it, since touch fires pointerenter on press); leaving the cell, scrolling, or
 * sending hides it. While the overlay is already visible, moving to an adjacent
 * cell swaps the preview immediately instead of re-arming the delay.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PreviewDescriptor } from "./PickerPreviewOverlay";

const HOVER_DELAY_MS = 160;

export interface PickerPreviewState {
  descriptor: PreviewDescriptor;
  anchor: DOMRect;
}

export interface PickerPreview {
  preview: PickerPreviewState | null;
  show: (descriptor: PreviewDescriptor, element: HTMLElement) => void;
  hide: () => void;
}

export function usePickerPreview(): PickerPreview {
  const [preview, setPreview] = useState<PickerPreviewState | null>(null);
  const previewRef = useRef<PickerPreviewState | null>(null);
  const timerRef = useRef(0);

  const apply = useCallback((next: PickerPreviewState | null) => {
    previewRef.current = next;
    setPreview(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
  }, []);

  const show = useCallback(
    (descriptor: PreviewDescriptor, element: HTMLElement) => {
      clearTimer();
      const activate = () => {
        timerRef.current = 0;
        apply({ descriptor, anchor: element.getBoundingClientRect() });
      };
      if (previewRef.current) {
        // Swap instantly between cells; avoids a flicker between two hovers.
        activate();
        return;
      }
      timerRef.current = window.setTimeout(activate, HOVER_DELAY_MS);
    },
    [apply, clearTimer],
  );

  const hide = useCallback(() => {
    clearTimer();
    if (previewRef.current) {
      apply(null);
    }
  }, [apply, clearTimer]);

  useEffect(
    () => () => {
      clearTimer();
    },
    [clearTimer],
  );

  return { preview, show, hide };
}
