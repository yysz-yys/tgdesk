/**
 * Telegram Web K ("day"/"light") wallpaper renderer, ported 1:1 from tweb
 * (morethanwords/tweb, GPL-3.0):
 *   src/helpers/freeformGradient.ts
 *   src/components/chat/gradientRenderer.ts
 *   src/components/chat/patternRenderer.ts
 *   src/components/chat/bubbles/chatBackground.module.scss
 *
 * A single 50x50 canvas holds the freeform gradient (4 colours at 4 moving
 * points); it is CSS-stretched over the whole page (height: 150%, top: -25%).
 * The doodle pattern is a second, page-sized canvas tiled with the bundled
 * black-on-transparent pattern.svg and composited with `soft-light` at the
 * wallpaper's intensity (0.5 for the light "light/day" theme).
 */

export const GRADIENT_SIZE = 50;

export const GRADIENT_POSITIONS = [
  { x: 0.8, y: 0.1 },
  { x: 0.6, y: 0.2 },
  { x: 0.35, y: 0.25 },
  { x: 0.25, y: 0.6 },
  { x: 0.2, y: 0.9 },
  { x: 0.4, y: 0.8 },
  { x: 0.65, y: 0.75 },
  { x: 0.75, y: 0.4 },
];

type Rgb = { r: number; g: number; b: number };

function positionsForPhase(phase: number) {
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i !== 4; ++i) {
    const point = GRADIENT_POSITIONS[(phase + i * 2) % GRADIENT_POSITIONS.length];
    result[i] = { x: point.x, y: 1.0 - point.y };
  }
  return result;
}

/** RGBA pixels of the freeform gradient at one phase (progress 1 = the phase itself). */
export function getGradientPixels(
  colors: Rgb[],
  phase: number,
  progress = 1,
  width = GRADIENT_SIZE,
  height = GRADIENT_SIZE,
  pixels = new Uint8ClampedArray(width * height * 4),
) {
  const colorsLength = colors.length;
  const previous = positionsForPhase((phase + 1) % GRADIENT_POSITIONS.length);
  const current = positionsForPhase(phase);

  let offset = 0;
  for (let y = 0; y < height; ++y) {
    const directPixelY = y / height;
    const centerDistanceY = directPixelY - 0.5;
    const centerDistanceY2 = centerDistanceY * centerDistanceY;
    for (let x = 0; x < width; ++x) {
      const directPixelX = x / width;
      const centerDistanceX = directPixelX - 0.5;
      const centerDistance = Math.sqrt(
        centerDistanceX * centerDistanceX + centerDistanceY2,
      );

      const swirlFactor = 0.35 * centerDistance;
      const theta = swirlFactor * swirlFactor * 0.8 * 8.0;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const pixelX = Math.max(
        0.0,
        Math.min(1.0, 0.5 + centerDistanceX * cosTheta - centerDistanceY * sinTheta),
      );
      const pixelY = Math.max(
        0.0,
        Math.min(1.0, 0.5 + centerDistanceX * sinTheta + centerDistanceY * cosTheta),
      );

      let distanceSum = 0.0;
      let r = 0.0;
      let g = 0.0;
      let b = 0.0;
      for (let i = 0; i < colorsLength; ++i) {
        const colorX = previous[i].x + (current[i].x - previous[i].x) * progress;
        const colorY = previous[i].y + (current[i].y - previous[i].y) * progress;

        const distanceX = pixelX - colorX;
        const distanceY = pixelY - colorY;

        let distance = Math.max(
          0.0,
          0.9 - Math.sqrt(distanceX * distanceX + distanceY * distanceY),
        );
        distance = distance * distance * distance * distance;
        distanceSum += distance;

        r += distance * colors[i].r;
        g += distance * colors[i].g;
        b += distance * colors[i].b;
      }

      pixels[offset++] = r / distanceSum;
      pixels[offset++] = g / distanceSum;
      pixels[offset++] = b / distanceSum;
      pixels[offset++] = 0xff;
    }
  }

  return pixels;
}

/** Average colour of the rendered gradient, like tweb's `averageColorFromCanvas`. */
export function gradientAverageColor(colors: string[]) {
  const rgb = colors.map(hexToRgb);
  const data = getGradientPixels(rgb, 0, 1);
  const total = [0, 0, 0];
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    total[0] += data[i];
    total[1] += data[i + 1];
    total[2] += data[i + 2];
  }
  return total.map((value) => Math.round(value / count)) as [number, number, number];
}

export function rgbaToHsla(r: number, g: number, b: number, a = 1) {
  (r /= 255), (g /= 255), (b /= 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100, a };
}

/**
 * tweb's service-plate colour: the wallpaper's average colour, saturated a
 * little and darkened, at 40% alpha (`helpers/highlightingColor.ts`).
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  (h /= 360), (s /= 100), (l /= 100);
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round) as [number, number, number];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255),
  ];
}

/**
 * tweb's service-plate colour: the wallpaper's average colour, saturated a
 * little and darkened, at 40% alpha (`helpers/highlightingColor.ts`).
 */
export function highlightingColor(rgba: [number, number, number]) {
  const hsl = rgbaToHsla(rgba[0], rgba[1], rgba[2]);
  let { s } = hsl;
  if (s > 0) s = Math.min(100, s + 5 + 0.1 * (100 - s));
  const l = Math.max(0, hsl.l * 0.65);
  const h = Math.round(hsl.h * 100) / 100;
  const sa = Math.round(s * 100) / 100;
  const la = Math.round(l * 100) / 100;
  const rgb = hslToRgb(h, sa, la);
  return {
    hsla: `hsla(${h}, ${sa}%, ${la}%, .4)`,
    rgb: rgb.join(", "),
    alpha: 0.4,
  };
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/** Draws the freeform gradient into a 50x50 canvas (initial phase, no animation). */
export function renderGradient(
  canvas: HTMLCanvasElement,
  colors: string[],
  phase = 0,
) {
  canvas.width = GRADIENT_SIZE;
  canvas.height = GRADIENT_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  const rgb = colors.map(hexToRgb);
  if (rgb.length < 2) {
    const color = rgb[0] ?? { r: 255, g: 255, b: 255 };
    context.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    context.fillRect(0, 0, GRADIENT_SIZE, GRADIENT_SIZE);
    return;
  }
  const data = getGradientPixels(rgb, phase, 1);
  const image = new ImageData(data, GRADIENT_SIZE, GRADIENT_SIZE);
  context.putImageData(image, 0, 0);
}

/**
 * Tiles the doodle pattern over a page-sized canvas the way tweb does: the tile
 * is as tall as `500 + windowHeight / 2.5` CSS px, centred vertically, repeated
 * up and down, and the pattern is painted black-on-transparent for `soft-light`.
 */
export function renderPattern(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement,
  width: number,
  height: number,
  dpr = Math.min(2, window.devicePixelRatio || 1),
) {
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const context = canvas.getContext("2d");
  if (!context) return;

  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const patternHeight = (500 + height / 2.5) * dpr;
  const ratio = patternHeight / sourceHeight;
  const imageWidth = sourceWidth * ratio;

  const centerY = (canvas.height - patternHeight) / 2;
  const drawRow = (y: number) => {
    for (let column = 0, x = 0; x < canvas.width; x = ++column * imageWidth) {
      context.drawImage(source, x, y, imageWidth, patternHeight);
    }
  };

  drawRow(centerY);
  if (centerY > 0) {
    let topY = centerY;
    do {
      drawRow((topY -= patternHeight));
    } while (topY >= 0);
  }
  const endY = canvas.height - 1;
  for (
    let bottomY = centerY + patternHeight;
    bottomY < endY;
    bottomY += patternHeight
  ) {
    drawRow(bottomY);
  }
}
