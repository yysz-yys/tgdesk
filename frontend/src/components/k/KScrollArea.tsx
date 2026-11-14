import { useEffect, useRef } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";

interface KScrollAreaProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Web K's custom scrollbar for an existing scroll container (tweb
 * components/scrollable2.tsx + scss/partials/_scrollable.scss, the
 * `custom-scroll` branch used when the platform has no true overlay scrollbars,
 * i.e. every Windows WebView2):
 *
 * - the native scrollbar is hidden by the `.scrollable` styles (it would also
 *   steal ~6px of the content width, which the real client does not lose);
 * - a 5px rounded thumb in `--scrollbar-color` is drawn 1px from the inline
 *   edge, sized exactly like tweb's (visible fraction scaled by 0.75, never
 *   under 20px) and moved with `translateY`;
 * - it fades in while the area is hovered, and can be dragged.
 *
 * `useScrollThumb` is the same behaviour for a container that owns its own
 * scrolling (the conversation's message list, whose ref and scroll handlers are
 * the page's own).
 */
export function useScrollThumb(scrollRef: RefObject<HTMLDivElement | null>) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);

  const updateThumb = () => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb) return;

    const clientSize = el.clientHeight;
    const scrollSize = el.scrollHeight;
    if (clientSize >= scrollSize) {
      thumb.style.height = "0px";
      return;
    }

    const divider = scrollSize / clientSize / 0.75;
    const thumbSize = Math.max(20, clientSize / divider);
    const scrollTop = el.scrollTop;
    const maxScroll = scrollSize - clientSize;
    const value = (scrollTop / maxScroll) * clientSize;
    const b = scrollTop / maxScroll;
    const maxValue = clientSize - thumbSize;

    // The thumb lives in a sticky row at the top of the content, so it starts at
    // the scroll container's padding edge, not its border edge (the chat list
    // pads for the floating folder strip, the message list for its own
    // breathing room). Clamp the travel so the capsule never pokes past the
    // bottom of the scrollport when the padding would push it out.
    const container = thumb.parentElement;
    const base = container
      ? container.getBoundingClientRect().top -
        el.getBoundingClientRect().top
      : 0;
    const travel = Math.max(
      0,
      Math.min(Math.min(maxValue, value - thumbSize * b), clientSize - thumbSize - base),
    );

    thumb.style.height = `${thumbSize}px`;
    thumb.style.transform = `translateY(${travel}px)`;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const schedule = () => {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(updateThumb);
    };

    el.addEventListener("scroll", schedule, { passive: true });

    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(el);
    const observed = new Set<Element>();
    const observeChildren = () => {
      for (const child of Array.from(el.children)) {
        if (child === thumbRef.current?.parentElement || observed.has(child)) continue;
        observed.add(child);
        resizeObserver.observe(child);
      }
      schedule();
    };
    const mutationObserver = new MutationObserver(observeChildren);
    mutationObserver.observe(el, { childList: true });
    observeChildren();

    schedule();
    return () => {
      el.removeEventListener("scroll", schedule);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const onThumbMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb) return;
    event.preventDefault();
    event.stopPropagation();

    thumb.classList.add("is-focused");
    const startY = event.clientY;
    const startScroll = el.scrollTop;
    const clientSize = el.clientHeight;
    const thumbSize = thumb.offsetHeight;
    const maxScroll = el.scrollHeight - clientSize;
    const maxThumbOffset = clientSize - thumbSize;

    const onMove = (moveEvent: MouseEvent) => {
      if (!maxThumbOffset) return;
      const delta = moveEvent.clientY - startY;
      el.scrollTop = startScroll + (delta / maxThumbOffset) * maxScroll;
    };
    const onUp = () => {
      thumb.classList.remove("is-focused");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return { thumbRef, onThumbMouseDown };
}

/** A wrapper around arbitrary children that scrolls with Web K's scrollbar. */
export function KScrollArea({ className, style, children }: KScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { thumbRef, onThumbMouseDown } = useScrollThumb(scrollRef);

  return (
    <div ref={scrollRef} className={`scrollable scrollable-y ${className ?? ""}`} style={style}>
      <div className="scrollable-thumb-container">
        <div
          ref={thumbRef}
          className="scrollable-thumb"
          onMouseDown={onThumbMouseDown}
          aria-hidden="true"
        />
      </div>
      {children}
    </div>
  );
}
