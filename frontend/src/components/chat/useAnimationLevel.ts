import { useEffect, useState } from "react";

/**
 * tweb's interface animation level (liteMode): 2 full, 1 reduced, 0 off.
 * `KMainScreen` writes it to `.k-root[data-animation-level]`; the chat chrome
 * reads it to gate the pinned-plate row roll, the status crossfade and the
 * go-down smooth scroll exactly like Web K does.
 */
export function useChromeAnimationLevel(): number {
  const read = (): number => {
    if (typeof document === "undefined") {
      return 2;
    }
    const root = document.querySelector(".k-root");
    const value = Number(root?.getAttribute("data-animation-level") ?? "2");
    return Number.isFinite(value) ? value : 2;
  };
  const [level, setLevel] = useState(read);
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.querySelector(".k-root");
    if (!root) {
      return;
    }
    const observer = new MutationObserver(() => setLevel(read()));
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-animation-level"],
    });
    return () => observer.disconnect();
  }, []);
  return level;
}
