import { flushSync } from "react-dom";
import { resolveTheme, type ThemePreference } from "./useTheme";

export interface RevealPoint {
  x: number;
  y: number;
}

interface RevealOptions {
  /** Click coordinates: the circle spreads from here. */
  point?: RevealPoint;
  /** 0 = no animation, 1 = crossfade, 2 = circle spreading from the click. */
  animationLevel?: number;
}

type StartViewTransition = (callback: () => void | Promise<void>) => {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition?: () => void;
};

/**
 * Ports tweb's `themeController.setTheme` visual switch: the new appearance is
 * revealed by a circle spreading from the clicked control (View Transitions),
 * falling back to the browser's crossfade at animation level 1, and to an
 * instant switch when animations are off / the API or reduced motion is
 * unavailable. The transition also covers the page's wallpaper repaint because
 * the theme update is flushed synchronously inside the snapshot callback.
 */
export function applyThemeWithReveal(
  apply: () => void,
  preference: ThemePreference,
  options: RevealOptions = {},
) {
  const root = document.documentElement;
  const startViewTransition = (
    document as Document & { startViewTransition?: StartViewTransition }
  ).startViewTransition;
  const currentNight = root.dataset.theme === "dark";
  const nextNight = resolveTheme(preference) === "dark";
  const animationLevel = options.animationLevel ?? 2;
  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  if (
    !startViewTransition ||
    animationLevel < 1 ||
    reducedMotion ||
    currentNight === nextNight
  ) {
    apply();
    return;
  }

  // The reference only spreads from the click at the highest motion level; the
  // reduced level keeps the default cross-fade.
  const point = animationLevel >= 2 ? options.point : undefined;
  const reverse = !currentNight;
  if (point) {
    root.classList.add("no-view-transition");
    root.classList.toggle("reverse", reverse);
    void root.offsetLeft; // reflow so the classes are captured on the old side
  }

  let transition: ReturnType<StartViewTransition>;
  try {
    transition = startViewTransition.call(document, () => {
      flushSync(apply);
      root.dataset.theme = nextNight ? "dark" : "light";
      root.style.colorScheme = nextNight ? "dark" : "light";
    });
  } catch {
    root.classList.remove("no-view-transition", "reverse");
    apply();
    return;
  }

  // A stalled transition must never leave the page on a frozen snapshot.
  const safety = window.setTimeout(() => transition.skipTransition?.(), 2500);
  transition.finished
    .catch(() => undefined)
    .finally(() => {
      window.clearTimeout(safety);
      root.classList.remove("no-view-transition", "reverse");
    });

  if (!point) {
    transition.ready.catch(() => undefined);
    return;
  }

  const { x, y } = point;
  const pseudoElement = `::view-transition-${reverse ? "old" : "new"}(root)`;

  transition.ready
    .then(() => {
      // Clip percentages resolve against the snapshot box itself, so the
      // origin/radius follow the click in every engine (tweb's fix for older
      // Chromium running the clip in backing-store pixels).
      const box = getComputedStyle(root, pseudoElement);
      const width = parseFloat(box.width);
      const height = parseFloat(box.height);
      const measured = width > 0 && height > 0;
      const boxWidth = measured ? width : window.innerWidth;
      const boxHeight = measured ? height : window.innerHeight;
      const endRadius = Math.hypot(
        Math.max(x, boxWidth - x),
        Math.max(y, boxHeight - y),
      );
      const circle = measured
        ? (radius: number) =>
            `circle(${(radius / Math.hypot(width, height)) * Math.SQRT2 * 100}% at ${(x / width) * 100}% ${(y / height) * 100}%)`
        : (radius: number) => `circle(${radius}px at ${x}px ${y}px)`;
      const forwards = !reverse;
      const keyframes: Keyframe[] = forwards
        ? [{ clipPath: circle(0) }, { clipPath: circle(endRadius) }]
        : [{ clipPath: circle(endRadius) }, { clipPath: circle(0) }];

      root.animate(keyframes, {
        // tweb's standard transition is 300 ms forward, 250 ms backward, then
        // stretched ×2 for the view-transition snapshots.
        duration: (forwards ? 300 : 250) * 2,
        easing: "cubic-bezier(.4, .0, .2, 1)",
        pseudoElement,
        fill: "forwards",
      });
    })
    .catch(() => undefined);
}
