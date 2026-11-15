/**
 * The Night mask render of a theme tile's wallpaper (tweb's mask path): the
 * theme's gradient only shows through the doodle lines, dimmed over the tile's
 * black plate. The doodle pattern is a black-on-transparent SVG served by the
 * kernel's loopback endpoint, so it is drawn into a canvas with
 * `destination-in` (gradient kept only where the doodle is) rather than used as
 * a CSS mask: an SVG referenced from a cross-origin URL is not allowed as a CSS
 * mask by the browser, while drawing it into a canvas is.
 */
import { useEffect, useRef } from "react";

interface KThemeTileMaskProps {
  /** The wallpaper's four gradient stops, CSS colours. */
  colors: string[];
  /** The theme's doodle pattern SVG URL. */
  patternUrl: string;
  /** How much of the gradient shows through (tweb's max(.3, |intensity| / 2)). */
  opacity: number;
  /** Only paint while the tips deck is open. */
  enabled: boolean;
}

const patternImages = new Map<string, Promise<HTMLImageElement>>();

function loadPattern(url: string) {
  const cached = patternImages.get(url);
  if (cached) return cached;
  const task = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`pattern ${url}`));
    image.src = url;
  });
  task.catch(() => patternImages.delete(url));
  patternImages.set(url, task);
  return task;
}

export function KThemeTileMask({
  colors,
  patternUrl,
  opacity,
  enabled,
}: KThemeTileMaskProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas || colors.length < 2) {
      return;
    }
    let cancelled = false;

    const draw = async () => {
      let pattern: HTMLImageElement;
      try {
        pattern = await loadPattern(patternUrl);
      } catch {
        return;
      }
      if (cancelled || !canvas.isConnected) return;

      const width = canvas.clientWidth || 72;
      const height = canvas.clientHeight || 96;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const context = canvas.getContext("2d");
      if (!context) return;

      // The gradient, bottom-right to top-left (the tile preview's diagonal).
      const gradient = context.createLinearGradient(
        0,
        canvas.height,
        canvas.width,
        0,
      );
      colors.forEach((color, index) => {
        gradient.addColorStop(index / (colors.length - 1), color);
      });
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Keep the gradient only along the doodles (tweb's mask render).
      const sourceWidth = pattern.naturalWidth || 1;
      const sourceHeight = pattern.naturalHeight || 1;
      const ratio = Math.max(
        canvas.width / sourceWidth,
        canvas.height / sourceHeight,
      );
      const imageWidth = sourceWidth * ratio;
      const imageHeight = sourceHeight * ratio;
      context.globalCompositeOperation = "destination-in";
      context.drawImage(
        pattern,
        (canvas.width - imageWidth) / 2,
        (canvas.height - imageHeight) / 2,
        imageWidth,
        imageHeight,
      );
      context.globalCompositeOperation = "source-over";
    };

    void draw();
    return () => {
      cancelled = true;
    };
  }, [enabled, patternUrl, colors.join(","), opacity]);

  return (
    <canvas
      ref={canvasRef}
      className="k-tip-theme-mask"
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}
