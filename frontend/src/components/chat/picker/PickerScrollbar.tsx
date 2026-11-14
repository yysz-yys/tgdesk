/**
 * Thin overlay scrollbar for the sticker/GIF scroll containers.
 *
 * The emoji tab keeps its own private implementation inside `EmojiPicker.tsx`
 * (it also drives the category scroll-spy), but the two new tabs reuse the same
 * `.g-emoji-picker-scrollbar` / `.g-emoji-picker-thumb` markup and classes so
 * the native scrollbar can stay hidden while the 5-column / 3-column geometry
 * (376 px of usable width inside the 382 px panel) is preserved.
 */
import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

interface PickerScrollbarProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
}

interface DragState {
  startY: number;
  startScrollTop: number;
  thumbRange: number;
  maxScroll: number;
}

export function PickerScrollbar({ scrollerRef }: PickerScrollbarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const update = useCallback(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!scroller || !track || !thumb) {
      return;
    }
    const { clientHeight, scrollHeight, scrollTop } = scroller;
    const visible = clientHeight > 0 && scrollHeight > clientHeight + 1;
    track.style.display = visible ? "block" : "none";
    if (!visible) {
      return;
    }
    const thumbHeight = Math.max(
      24,
      Math.round((clientHeight * clientHeight) / scrollHeight),
    );
    const range = clientHeight - thumbHeight;
    const maxScroll = scrollHeight - clientHeight;
    const offset =
      maxScroll <= 0 ? 0 : Math.round((scrollTop / maxScroll) * range);
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${offset}px)`;
  }, [scrollerRef]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(scroller);
    // Sections mount lazily and images swap in later; any subtree change can
    // alter scrollHeight, so refresh the thumb instead of only watching resize.
    const mutations = new MutationObserver(schedule);
    mutations.observe(scroller, { childList: true, subtree: true });
    update();
    return () => {
      scroller.removeEventListener("scroll", schedule);
      resize.disconnect();
      mutations.disconnect();
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [scrollerRef, update]);

  const onThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const scroller = scrollerRef.current;
      const thumb = thumbRef.current;
      if (!scroller || !thumb) {
        return;
      }
      const thumbRange = scroller.clientHeight - thumb.offsetHeight;
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      if (thumbRange <= 0 || maxScroll <= 0) {
        return;
      }
      event.preventDefault();
      dragRef.current = {
        startY: event.clientY,
        startScrollTop: scroller.scrollTop,
        thumbRange,
        maxScroll,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail if the pointer is already gone; the element
        // level move handler still drives the drag.
      }
    },
    [scrollerRef],
  );

  const onThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const scroller = scrollerRef.current;
      if (!drag || !scroller) {
        return;
      }
      scroller.scrollTop =
        drag.startScrollTop +
        ((event.clientY - drag.startY) / drag.thumbRange) * drag.maxScroll;
    },
    [scrollerRef],
  );

  const stopThumbDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer was already released (pointercancel / window lost focus).
    }
  }, []);

  return (
    <div
      ref={trackRef}
      className="g-emoji-picker-scrollbar"
      aria-hidden="true"
      style={{ display: "none" }}
    >
      <div
        ref={thumbRef}
        className="g-emoji-picker-thumb"
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={stopThumbDrag}
        onPointerCancel={stopThumbDrag}
      />
    </div>
  );
}
