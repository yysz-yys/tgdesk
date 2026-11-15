import { useEffect, useRef } from "react";
import {
  gradientAverageColor,
  highlightingColor,
  renderGradient,
  renderPattern,
  renderPatternMask,
} from "./wallpaper";
import {
  activeWallpaper,
  DEFAULT_PATTERN_URL,
  DEFAULT_WALLPAPER,
  useActiveTheme,
} from "./themeStore";

/** The Telegram "light/day" factory wallpaper: four gradient stops + the doodle pattern. */
export const LIGHT_DAY_WALLPAPER = {
  colors: DEFAULT_WALLPAPER.colors,
  /** `wallPaperSettings.intensity` / 100 */
  intensity: DEFAULT_WALLPAPER.intensity,
};

interface KWallpaperProps {
  /** The shell is in its dark variant: paint the theme's night wallpaper. */
  night?: boolean;
  /** Override the gradient stops (defaults to the active theme's wallpaper). */
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
 * and the doodle pattern, and its day/night side follows the shell brightness:
 * a light shell paints the theme's day wallpaper, a dark shell its night one
 * (factory Night is the pink→purple gradient when no theme is applied). Dark
 * wallpapers invert the black doodle pattern so it reads as a light overlay,
 * the way the reference draws its night patterns.
 */
export function KWallpaper({
  night = false,
  colors,
  intensity,
  patternUrl,
}: KWallpaperProps) {
  const activeTheme = useActiveTheme();
  const gradientRef = useRef<HTMLCanvasElement>(null);
  const patternRef = useRef<HTMLCanvasElement>(null);

  const wallpaper = activeWallpaper(activeTheme, night);
  const stops =
    colors ??
    (wallpaper.colors.length >= 2 ? wallpaper.colors : DEFAULT_WALLPAPER.colors);
  const patternIntensity = intensity ?? wallpaper.intensity;
  const url = patternUrl ?? wallpaper.patternUrl ?? DEFAULT_PATTERN_URL;
  // The factory Night wallpaper uses the reference's mask render path (black
  // plate with the doodles punched out), everything else the soft-light overlay.
  const maskPattern = patternUrl ? false : wallpaper.mask;
  const invertedPattern = !maskPattern && wallpaper.dark;
  // The mask path dims the gradient (the pattern covers the rest of the page):
  // tweb's max(0.3, |intensity| / 2). The overlay path keeps it at full opacity.
  const gradientOpacity = maskPattern
    ? Math.max(0.3, Math.min(1, wallpaper.intensity / 2))
    : 1;

  useEffect(() => {
    const gradient = gradientRef.current;
    const pattern = patternRef.current;
    if (!gradient || !pattern) return;

    renderGradient(gradient, stops);

    // Expose the wallpaper average for controls that sit on the wallpaper (the
    // reference's highlighting colour); the applied cloud theme overrides
    // `--message-highlighting-color` itself in themeStore.
    const highlight = highlightingColor(gradientAverageColor(stops));
    const root = document.documentElement;
    root.style.setProperty("--wallpaper-highlighting-color", highlight.hsla);
    root.style.setProperty("--wallpaper-highlighting-color-rgb", highlight.rgb);

    let disposed = false;
    let loaded: HTMLImageElement | null = null;

    const drawPattern = () => {
      if (disposed || !loaded) return;
      const draw = maskPattern ? renderPatternMask : renderPattern;
      draw(
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
  }, [stops.join(","), patternIntensity, url, invertedPattern, maskPattern, gradientOpacity]);

  return (
    <div className="k-wallpaper" aria-hidden="true">
      <canvas
        ref={gradientRef}
        className="k-wallpaper-gradient"
        style={{ opacity: gradientOpacity }}
      />
      <canvas
        ref={patternRef}
        className="k-wallpaper-pattern"
        style={{
          opacity: maskPattern ? 1 : patternIntensity,
          mixBlendMode: maskPattern ? "normal" : "soft-light",
          filter: invertedPattern ? "invert(1)" : undefined,
        }}
      />
    </div>
  );
}
