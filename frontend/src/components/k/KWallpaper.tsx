import { useEffect, useRef } from "react";
import {
  gradientAverageColor,
  highlightingColor,
  renderGradient,
  renderPattern,
} from "./wallpaper";

/** The Telegram "light/day" factory wallpaper: four gradient stops + the doodle pattern. */
export const LIGHT_DAY_WALLPAPER = {
  colors: ["#b1e0fa", "#82b0d8", "#a0d8e8", "#e5f0f8"],
  /** `wallPaperSettings.intensity` / 100 */
  intensity: 0.5,
};

const PATTERN_URL = "/assets/img/pattern.svg";

interface KWallpaperProps {
  colors?: string[];
  intensity?: number;
}

/**
 * The page-wide Telegram Web K chat wallpaper: a 50x50 freeform gradient
 * stretched over the viewport, under a tiled doodle pattern composited with
 * `soft-light` (see `chatBackground.module.scss` in tweb).
 */
export function KWallpaper({
  colors = LIGHT_DAY_WALLPAPER.colors,
  intensity = LIGHT_DAY_WALLPAPER.intensity,
}: KWallpaperProps) {
  const gradientRef = useRef<HTMLCanvasElement>(null);
  const patternRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const gradient = gradientRef.current;
    const pattern = patternRef.current;
    if (!gradient || !pattern) return;

    renderGradient(gradient, colors);

    // tweb's chatTips plates keep the theme's factory highlighting colour
    // (themeSettings.highlightingColor) rather than the wallpaper average the
    // app background publishes on the root; expose both so later pages can use
    // either.
    const highlight = highlightingColor(gradientAverageColor(colors));
    const root = document.documentElement;
    root.style.setProperty("--wallpaper-highlighting-color", highlight.hsla);
    root.style.setProperty("--wallpaper-highlighting-color-rgb", highlight.rgb);

    let disposed = false;
    let loaded: HTMLImageElement | null = null;

    const drawPattern = () => {
      if (disposed || !loaded) return;
      renderPattern(
        pattern,
        loaded,
        window.innerWidth,
        window.innerHeight,
        Math.min(2, window.devicePixelRatio || 1),
      );
    };

    const image = new Image();
    image.decoding = "sync";
    image.onload = () => {
      loaded = image;
      drawPattern();
    };
    image.src = PATTERN_URL;

    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(drawPattern);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      image.onload = null;
    };
  }, [colors.join(","), intensity]);

  return (
    <div className="k-wallpaper" aria-hidden="true">
      <canvas ref={gradientRef} className="k-wallpaper-gradient" />
      <canvas
        ref={patternRef}
        className="k-wallpaper-pattern"
        style={{ opacity: Math.abs(intensity), mixBlendMode: "soft-light" }}
      />
    </div>
  );
}
