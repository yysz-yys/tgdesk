import { useEffect, useRef } from "react";
import {
  gradientAverageColor,
  highlightingColor,
  renderGradient,
  renderPattern,
} from "./wallpaper";
import { DEFAULT_WALLPAPER, DEFAULT_PATTERN_URL, useActiveTheme } from "./themeStore";

/** The Telegram "light/day" factory wallpaper: four gradient stops + the doodle pattern. */
export const LIGHT_DAY_WALLPAPER = {
  colors: DEFAULT_WALLPAPER.colors,
  /** `wallPaperSettings.intensity` / 100 */
  intensity: DEFAULT_WALLPAPER.intensity,
};

interface KWallpaperProps {
  /** Override the gradient stops (defaults to the active theme's day wallpaper). */
  colors?: string[];
  /** Pattern opacity 0..1 (defaults to the active theme's |intensity| / 100). */
  intensity?: number;
  /** Pattern SVG URL (defaults to the active theme's pattern or the bundled one). */
  patternUrl?: string;
}

/**
 * The page-wide Telegram Web K chat wallpaper: a 50x50 freeform gradient
 * stretched over the viewport, under a tiled pattern composited with
 * `soft-light` (see `chatBackground.module.scss` in tweb).
 *
 * The active global theme (the Appearance strip) replaces the factory colours
 * and the doodle pattern; with no theme selected the factory "Day" wallpaper of
 * the reference capture is used.
 */
export function KWallpaper({ colors, intensity, patternUrl }: KWallpaperProps) {
  const activeTheme = useActiveTheme();
  const gradientRef = useRef<HTMLCanvasElement>(null);
  const patternRef = useRef<HTMLCanvasElement>(null);

  const theme = activeTheme?.wallpaper;
  const stops =
    colors ??
    (theme && theme.colors.length >= 2 ? theme.colors : DEFAULT_WALLPAPER.colors);
  const patternIntensity =
    intensity ??
    (theme ? theme.intensity : DEFAULT_WALLPAPER.intensity);
  const url =
    patternUrl ??
    (theme && theme.patternUrl ? theme.patternUrl : DEFAULT_PATTERN_URL);

  useEffect(() => {
    const gradient = gradientRef.current;
    const pattern = patternRef.current;
    if (!gradient || !pattern) return;

    renderGradient(gradient, stops);

    // tweb's chatTips plates keep the theme's factory highlighting colour
    // (themeSettings.highlightingColor) rather than the wallpaper average the
    // app background publishes on the root; expose both so later pages can use
    // either.
    const highlight = highlightingColor(gradientAverageColor(stops));
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
    image.src = url;

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
  }, [stops.join(","), patternIntensity, url]);

  return (
    <div className="k-wallpaper" aria-hidden="true">
      <canvas ref={gradientRef} className="k-wallpaper-gradient" />
      <canvas
        ref={patternRef}
        className="k-wallpaper-pattern"
        style={{ opacity: patternIntensity, mixBlendMode: "soft-light" }}
      />
    </div>
  );
}
