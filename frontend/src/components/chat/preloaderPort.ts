/*
 * Port of Telegram Web K's `src/components/preloaderRing.ts` geometry and phase
 * engine for the document bubble's download indicator (temp/tweb, commit
 * 2e4bbb5). The drawing lives in the indicator's own 54-unit box and is scaled
 * to whatever box the consumer gives it.
 *
 * The script only draws the arrow <-> ring morph and the progress line; the
 * CSS in document-bubble.css carries the ring spin, the wave and the reveal
 * transitions (see `_preloader.scss` / `_document.scss` in tweb).
 */

const N = 12;
const R = 19;
export const CIRCUMFERENCE = 2 * Math.PI * R;
const DEG = Math.PI / 180;

const round = (x: number) => Math.round(x * 100) / 100;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const ringPoint = (a: number): [number, number] => [
  round(27 + R * Math.cos(a)),
  round(27 + R * Math.sin(a)),
];

/* ── drawing, in the 54-unit box ── */

const TIP: [number, number] = [27, 30.96];
const SHAFT_TOP = 19.08;
const ARM_ENDS: Array<[number, number]> = [
  [21.85, 25.81],
  [32.15, 25.81],
];
const ARM_LENGTH = Math.hypot(TIP[0] - ARM_ENDS[0][0], TIP[1] - ARM_ENDS[0][1]);
const BASE_Y = 34.92;
const BASE_FROM = 20.07;
const BASE_TO = 33.93;
const BASE_LENGTH = BASE_TO - BASE_FROM;

const J_START = 159 * DEG;
const J_BEND = 148 * DEG;
const [J_X0, J_Y0] = ringPoint(J_START);
const [J_X1, J_Y1] = ringPoint(J_BEND);
const J_C1: [number, number] = [
  round(J_X1 + 9.6 * Math.sin(J_BEND)),
  round(J_Y1 - 9.6 * Math.cos(J_BEND)),
];
const J_C2: [number, number] = [TIP[0], round(TIP[1] + 10.1)];
export const J_PATH =
  `M${J_X0} ${J_Y0}A${R} ${R} 0 0 0 ${J_X1} ${J_Y1}` +
  `C${J_C1[0]} ${J_C1[1]} ${J_C2[0]} ${J_C2[1]} ${TIP[0]} ${TIP[1]}L${TIP[0]} ${SHAFT_TOP}`;
const J_LENGTH = (() => {
  let length = R * (J_START - J_BEND);
  let [px, py] = [J_X1, J_Y1];
  for (let i = 1; i <= 64; ++i) {
    const t = i / 64;
    const u = 1 - t;
    const x =
      u * u * u * J_X1 +
      3 * u * u * t * J_C1[0] +
      3 * u * t * t * J_C2[0] +
      t * t * t * TIP[0];
    const y =
      u * u * u * J_Y1 +
      3 * u * u * t * J_C1[1] +
      3 * u * t * t * J_C2[1] +
      t * t * t * TIP[1];
    length += Math.hypot(x - px, y - py);
    [px, py] = [x, y];
  }
  return length + TIP[1] - SHAFT_TOP;
})();
// where the shaft begins along the J: before it, the J is out of sight at rest
const J_SHAFT = 1 - (TIP[1] - SHAFT_TOP) / J_LENGTH;

// a dot as two arcs, so a dot is one path
const DOTS = Array.from({ length: N }, (_, i) => {
  const [x, y] = ringPoint(-90 * DEG + (i * 360) / N * DEG);
  return `M${round(x - 1.5)} ${y}a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0`;
});

export const DOT_PATHS: string[] = DOTS;
export const DOTS_REST_PATH = DOTS.slice(1).join("");
export const BASE_PATH = `M${BASE_FROM} ${BASE_Y}H${BASE_TO}`;
export const ARM_PATHS: string[] = ARM_ENDS.map(
  ([x, y]) => `M${TIP[0]} ${TIP[1]}L${x} ${y}`,
);
export const CROSS_PATH = "M21.6 21.6L32.4 32.4M32.4 21.6L21.6 32.4";

// the shaft at rest is the J seen before `J_SHAFT`; the dashes hide the rest
export const SHAFT_REST_DASHARRAY = `${round(J_LENGTH * (1 - J_SHAFT))} ${round(J_LENGTH * 2)}`;
export const SHAFT_REST_OFFSET = String(-round(J_LENGTH * J_SHAFT));

/* ── timings (ms), from preloaderRing.ts:126-146 ── */

export const GO = 500;
export const ARMS_IN = 200;
export const RING_IN = 240;
export const CROSS_IN = 270;
export const LAND = 440;
export const LANDED = 600;
export const BACK = 250;
export const SPIN = 8000;
// pressed, the ring starts this far round, so dot 0 meets the J's end after GO
export const SPIN_DELAY = -Math.round(
  ((((J_START / DEG + 90 - (360 * GO) / SPIN) % 360) + 360) % 360) / 360 * SPIN,
);
export const FOLLOW = 160;
export const WAVE = 1200;
export const WAVE_STEP = 100;

// cubic-bezier(.42, 0, .58, 1): CSS ease-in-out
const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const derivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-6) return sampleY(t);
      const slope = derivativeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= dx / slope;
    }
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 20; i += 1) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-6) break;
      if (dx < 0) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sampleY(t);
  };
};
const easeInOutBezier = cubicBezier(0.42, 0, 0.58, 1);
const easeInOut = (x: number) => easeInOutBezier(clamp01(x));

// the piece's brightness while it turns into dot 0
export const landing = (t: number) => 1 - 0.65 * smooth(clamp01((t - 250) / 300));

export interface ArrowPieces {
  container: HTMLElement;
  spin: HTMLElement;
  ring: SVGSVGElement;
  dot: SVGPathElement;
  line: SVGCircleElement;
  arrow: SVGSVGElement;
  base: SVGPathElement;
  shaft: SVGPathElement;
  arms: SVGPathElement[];
  cross: SVGSVGElement;
}

const put = (
  element: Element,
  name: string,
  value: string,
  cache: Map<Element, Record<string, string>>,
) => {
  let values = cache.get(element);
  if (!values) cache.set(element, (values = {}));
  if (values[name] === value) return;
  values[name] = value;
  element.setAttribute(name, value);
};

const piece = (
  path: SVGPathElement,
  length: number,
  from: number,
  to: number,
  cache: Map<Element, Record<string, string>>,
) => {
  put(
    path,
    "stroke-dasharray",
    `${round(Math.max(0, to - from) * length)} ${round(length * 2)}`,
    cache,
  );
  put(path, "stroke-dashoffset", `${-round(from * length)}`, cache);
};

export type AttributeCache = Map<Element, Record<string, string>>;
export const createAttributeCache = (): AttributeCache => new Map();

/** The arrow at rest: the shape the markup draws, before any morph moved it. */
export function drawArrowAtRest(pieces: ArrowPieces, cache: AttributeCache) {
  piece(pieces.shaft, J_LENGTH, J_SHAFT, 1, cache);
  put(pieces.shaft, "opacity", "1", cache);
  for (const arm of pieces.arms) {
    piece(arm, ARM_LENGTH, 0, 1, cache);
    put(arm, "opacity", "1", cache);
  }
  piece(pieces.base, BASE_LENGTH, 0, 1, cache);
  put(pieces.base, "opacity", "1", cache);
}

/**
 * One frame of the arrow <-> ring change, from `preloaderRing.ts:493-541`.
 * `t` is the time since the phase started, in ms.
 */
export function drawPhase(
  pieces: ArrowPieces,
  phase: "go" | "back",
  t: number,
  cache: Map<Element, Record<string, string>>,
) {
  const go = phase === "go";
  // the shaft: down the J and into the ring, or back up out of the tip
  let from = J_SHAFT;
  let to = 1;
  let opacity = 1;
  let width = 2;
  if (go) {
    const e = easeInOut(t / GO);
    from = J_SHAFT * (1 - e);
    to = 1 - e;
    opacity = t < LAND ? landing(t) : 0;
    width = 2 + clamp01((t - 250) / (LAND - 250));
  } else {
    to = J_SHAFT + (1 - J_SHAFT) * easeInOut(t / BACK);
    opacity = clamp01(t / BACK);
  }
  piece(pieces.shaft, J_LENGTH, from, to, cache);
  put(pieces.shaft, "opacity", opacity.toFixed(3), cache);
  pieces.shaft.style.strokeWidth = width.toFixed(2);

  // the arms draw in to the tip and the base to its middle, and back out
  const drawn = go ? 1 - easeInOut(t / ARMS_IN) : easeInOut(t / BACK);
  const seen = (go ? 1 - clamp01((t - 70) / 200) : clamp01(t / BACK)).toFixed(3);
  for (const arm of pieces.arms) {
    piece(arm, ARM_LENGTH, 0, drawn, cache);
    put(arm, "opacity", seen, cache);
  }
  piece(pieces.base, BASE_LENGTH, 0.5 - drawn / 2, 0.5 + drawn / 2, cache);
  put(pieces.base, "opacity", seen, cache);

  // the cross
  let scale = 1;
  let crossOpacity = 1;
  if (go) {
    crossOpacity = t < CROSS_IN ? 0 : 1;
    scale = 0.2 + 0.8 * easeInOut((t - CROSS_IN) / 200);
  } else {
    scale = 1 - 0.8 * easeInOut(t / 150);
    crossOpacity = 1 - clamp01(t / BACK);
  }
  pieces.cross.style.opacity = crossOpacity.toFixed(3);
  pieces.cross.style.transform = `scale(${scale.toFixed(3)})`;

  if (go) {
    if (t >= RING_IN) pieces.container.classList.remove("is-going");
    pieces.dot.style.visibility = t < LAND ? "hidden" : "";
  }
}

export function beginLine(pieces: ArrowPieces) {
  pieces.line.setAttribute("stroke-dasharray", `0 ${round(CIRCUMFERENCE)}`);
  pieces.line.setAttribute("opacity", "0");
  pieces.dot.setAttribute("opacity", "0.35");
  pieces.dot.style.visibility = "";
}

/**
 * The line and dot 0 for the progress shown, from `preloaderRing.ts:610-615`.
 * `lit` is the brightness dot 0 (or the line starting on it) has at least.
 */
export function renderLine(
  pieces: ArrowPieces,
  shown: number,
  lit: number,
  cache: Map<Element, Record<string, string>>,
) {
  const started = shown > 0.0005;
  put(
    pieces.line,
    "stroke-dasharray",
    `${round(shown * CIRCUMFERENCE)} ${round(CIRCUMFERENCE)}`,
    cache,
  );
  put(
    pieces.line,
    "opacity",
    started
      ? Math.max(0.35 + 0.65 * clamp01(shown * N * 2), lit).toFixed(3)
      : "0",
    cache,
  );
  put(
    pieces.dot,
    "opacity",
    started ? "0" : Math.max(0.35, lit).toFixed(3),
    cache,
  );
}
