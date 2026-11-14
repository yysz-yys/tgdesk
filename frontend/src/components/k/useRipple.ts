import { useEffect, useRef } from "react";

/**
 * React port of tweb's `ripple()` (src/components/ripple.ts): a press wave that
 * grows from the pointer, sized to reach the furthest corner of the element.
 * Attach the returned ref to the element (which must be `position: relative`);
 * the effect prepends the `.c-ripple` container and listens for mousedown.
 */
export function useRipple<T extends HTMLElement = HTMLDivElement>(
  disabled = false,
) {
  const elementRef = useRef<T>(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || disabled) return;

    el.classList.add("rp");
    let container = el.querySelector<HTMLElement>(":scope > .c-ripple");
    if (!container) {
      container = document.createElement("div");
      container.className = "c-ripple";
      el.prepend(container);
    }

    const onMouseDown = (event: MouseEvent) => {
      if (![0, 2].includes(event.button)) return;
      const target = event.currentTarget as HTMLElement;
      if (target.dataset.ripple === "0") return;

      const holder = container as HTMLElement;
      const rect = holder.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const startTime = Date.now();
      const circle = document.createElement("div");
      circle.className = "c-ripple__circle";

      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      const radius = Math.sqrt(
        (Math.abs(clickY - rect.height / 2) + rect.height / 2) ** 2 +
          (Math.abs(clickX - rect.width / 2) + rect.width / 2) ** 2,
      );
      const size = radius;

      circle.style.width = circle.style.height = `${size}px`;
      circle.style.left = `${clickX - size / 2}px`;
      circle.style.top = `${clickY - size / 2}px`;
      circle.style.opacity = "0";
      holder.append(circle);
      // force a reflow so the opacity transition runs in
      void circle.offsetWidth;
      circle.style.opacity = "";

      const duration =
        (parseFloat(getComputedStyle(holder).getPropertyValue("--ripple-duration")) ||
          0.7) * 1000;

      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        const elapsed = Date.now() - startTime;
        const delay =
          elapsed < duration
            ? Math.max(duration - elapsed, duration / 2)
            : duration / 2;
        window.setTimeout(
          () => circle.classList.add("hiding"),
          Math.max(delay - duration / 2, 0),
        );
        window.setTimeout(() => circle.remove(), delay);
        window.removeEventListener("mouseup", finish);
        window.removeEventListener("contextmenu", finish);
        window.removeEventListener("mousemove", finish);
      };

      window.addEventListener("mouseup", finish, { once: true, passive: true });
      window.addEventListener("contextmenu", finish, {
        once: true,
        passive: true,
      });
    };

    el.addEventListener("mousedown", onMouseDown, { passive: true });
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
    };
  }, [disabled]);

  return { ref: elementRef };
}

