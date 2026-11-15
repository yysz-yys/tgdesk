import { useEffect, useRef, useState } from "react";
import { useChromeAnimationLevel } from "./useAnimationLevel";
import {
  ARM_PATHS,
  BASE_PATH,
  CIRCUMFERENCE,
  CROSS_PATH,
  DOT_PATHS,
  J_PATH,
  SHAFT_REST_DASHARRAY,
  SHAFT_REST_OFFSET,
  SPIN_DELAY,
  WAVE_STEP,
  BACK,
  LAND,
  LANDED,
  FOLLOW,
  beginLine,
  createAttributeCache,
  drawArrowAtRest,
  drawPhase,
  landing,
  renderLine,
  type ArrowPieces,
  type AttributeCache,
} from "./preloaderPort";

export type DocumentDownloadState =
  | "idle"
  | "downloading"
  | "paused"
  | "failed"
  | "done";

interface DocumentDownloadProps {
  state: DocumentDownloadState;
  /** 0..100, from the DownloadTask map. */
  progress: number;
}

/**
 * Telegram Web K's `PreloaderRing` for a file bubble (temp/tweb
 * `src/components/preloaderRing.ts`): an arrow that turns into the 12-dot
 * progress ring while the file downloads, and back into the arrow when it is
 * paused. The reveal on hover and the container fade live in
 * `document-bubble.css`; this component draws the morph and the progress line.
 */
export function DocumentDownload({ state, progress }: DocumentDownloadProps) {
  const animationLevel = useChromeAnimationLevel();
  const containerRef = useRef<HTMLSpanElement>(null);
  const piecesRef = useRef<ArrowPieces | null>(null);
  const cacheRef = useRef<AttributeCache>(createAttributeCache());
  const levelRef = useRef(animationLevel);
  const targetRef = useRef(0);
  const shownRef = useRef(0);
  const phaseRef = useRef<{ name: "go" | "back"; at: number } | null>(null);
  const rafRef = useRef(0);
  const lastAtRef = useRef(0);
  const prevStateRef = useRef<DocumentDownloadState>(state);
  const finishedRef = useRef(false);
  const [gone, setGone] = useState(false);
  levelRef.current = animationLevel;

  const stopLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  };

  const renderNow = (lit = 0) => {
    const pieces = piecesRef.current;
    if (!pieces) return;
    renderLine(pieces, shownRef.current, lit, cacheRef.current);
  };

  const setWaiting = () => {
    const container = containerRef.current;
    const pieces = piecesRef.current;
    if (!container || !pieces) return;
    const waiting =
      prevStateRef.current === "downloading" &&
      targetRef.current === 0 &&
      !phaseRef.current &&
      levelRef.current === 2;
    container.classList.toggle("is-waiting", waiting);
  };

  const finishDone = () => {
    const container = containerRef.current;
    if (!container || finishedRef.current) return;
    finishedRef.current = true;
    container.classList.add("is-leaving");
    window.setTimeout(() => {
      if (containerRef.current === container) setGone(true);
    }, 200);
  };

  const stopPhase = () => {
    const pieces = piecesRef.current;
    const container = containerRef.current;
    const phase = phaseRef.current;
    if (!pieces || !container || !phase) return;
    phaseRef.current = null;
    container.classList.remove("is-going");
    pieces.dot.style.visibility = "";
    for (const element of [pieces.arrow, pieces.cross]) {
      element.style.transition = "";
      element.style.opacity = "";
      element.style.transform = "";
    }
    pieces.shaft.style.strokeWidth = "";
    if (phase.name === "back") {
      container.classList.remove("is-spinning");
      drawArrowAtRest(pieces, cacheRef.current);
    }
  };

  const tick = () => {
    rafRef.current = 0;
    const pieces = piecesRef.current;
    const container = containerRef.current;
    if (!pieces || !container || !container.isConnected) return;
    const now = performance.now();
    const dt = Math.min(64, now - lastAtRef.current);
    lastAtRef.current = now;
    const level = levelRef.current;

    let phaseTime = 0;
    let phase = phaseRef.current;
    if (phase) {
      phaseTime = now - phase.at;
      if (phaseTime >= (phase.name === "go" ? LANDED : BACK)) {
        stopPhase();
        phase = null;
        phaseTime = 0;
      } else if (level === 2) {
        drawPhase(pieces, phase.name, phaseTime, cacheRef.current);
      }
    }

    // pressed, the line waits for the shaft to land on dot 0
    const held = phase?.name === "go" && phaseTime < LAND;
    if (!level) {
      // animations off: the line stands where the bytes are, at once
      shownRef.current = targetRef.current;
    } else if (targetRef.current > shownRef.current && !held) {
      shownRef.current +=
        (targetRef.current - shownRef.current) * (1 - Math.exp(-dt / FOLLOW));
      if (targetRef.current - shownRef.current < 0.004) {
        shownRef.current = targetRef.current;
      }
      if (shownRef.current >= 0.996 && targetRef.current >= 1) {
        shownRef.current = 1;
      }
    }

    const lit =
      phase?.name === "go" && phaseTime >= LAND ? landing(phaseTime) : 0;
    renderLine(pieces, shownRef.current, lit, cacheRef.current);
    setWaiting();

    if (
      prevStateRef.current === "done" &&
      targetRef.current >= 1 &&
      shownRef.current >= 1
    ) {
      finishDone();
      return;
    }

    if (phaseRef.current || targetRef.current > shownRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const run = () => {
    if (rafRef.current) return;
    lastAtRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };

  const startPhase = (name: "go" | "back") => {
    const pieces = piecesRef.current;
    const container = containerRef.current;
    if (!pieces || !container) return;
    phaseRef.current = { name, at: performance.now() };
    pieces.arrow.style.transition = "none";
    pieces.cross.style.transition = "none";
    pieces.arrow.style.opacity = "1";
    if (name === "go") {
      cacheRef.current.clear();
      drawArrowAtRest(pieces, cacheRef.current);
      const spin = container.querySelector<HTMLElement>(".k-doc-dl-spin");
      if (spin) spin.style.animationDelay = `${SPIN_DELAY}ms`;
      container.classList.add("is-going");
    }
    drawPhase(pieces, name, 0, cacheRef.current);
    run();
  };

  // -- wiring --

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const spin = container.querySelector<HTMLSpanElement>(".k-doc-dl-spin");
    const ring = container.querySelector<SVGSVGElement>(".k-doc-dl-ring");
    const dot = ring?.querySelector<SVGPathElement>(".k-doc-dl-dot");
    const line = ring?.querySelector<SVGCircleElement>(".k-doc-dl-line");
    const arrow = container.querySelector<SVGSVGElement>(".k-doc-dl-arrow");
    const cross = container.querySelector<SVGSVGElement>(".k-doc-dl-cross");
    if (!spin || !ring || !dot || !line || !arrow || !cross) return;
    const [base, shaft, ...arms] = Array.from(
      arrow.querySelectorAll<SVGPathElement>("path"),
    );
    piecesRef.current = {
      container,
      spin,
      ring,
      dot,
      line,
      arrow,
      base,
      shaft,
      arms,
      cross,
    };
    // a React remount resets the markup's attributes: drop the write cache
    cacheRef.current.clear();
    beginLine(piecesRef.current);
    drawArrowAtRest(piecesRef.current, cacheRef.current);
    return () => {
      stopLoop();
      piecesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const pieces = piecesRef.current;
    if (!container || !pieces || gone) return;
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    const level = levelRef.current;

    if (state === "done") {
      if (prev === "done") {
        setGone(true);
        return;
      }
      stopLoop();
      container.classList.remove("is-waiting");
      targetRef.current = 1;
      if (!level) {
        shownRef.current = 1;
        renderNow(1);
        finishDone();
      } else if (shownRef.current >= 0.996) {
        renderNow(1);
        finishDone();
      } else {
        run();
      }
      return;
    }

    if (state === "downloading") {
      const isNewStart =
        prev === "idle" || prev === "failed" || prev === "paused";
      container.classList.remove("is-manual", "is-leaving");
      container.classList.add("is-spinning");
      if (isNewStart) {
        beginLine(pieces);
        shownRef.current = 0;
        targetRef.current = Math.min(100, Math.max(0, progress)) / 100;
        if (level === 2) {
          startPhase("go");
        } else if (level === 1) {
          // reduced: a crossfade, no morph
          for (const element of [pieces.arrow, pieces.cross]) {
            element.style.transition = "";
            element.style.opacity = "";
            element.style.transform = "";
          }
          container.classList.remove("is-going");
        }
      } else {
        targetRef.current = Math.min(100, Math.max(0, progress)) / 100;
        // an already-running transfer draws at its progress on first paint
        if (!phaseRef.current && shownRef.current === 0) {
          shownRef.current = targetRef.current;
        }
      }
      renderNow();
      run();
      return;
    }

    // idle / paused / failed: the arrow at rest
    stopLoop();
    container.classList.add("is-manual");
    container.classList.remove("is-going", "is-waiting");
    if (prev === "downloading" && level === 2) {
      startPhase("back");
    } else {
      container.classList.remove("is-spinning");
      const spin = container.querySelector<HTMLSpanElement>(".k-doc-dl-spin");
      if (spin) spin.style.animationDelay = "";
      const arrow = container.querySelector<SVGSVGElement>(".k-doc-dl-arrow");
      const cross = container.querySelector<SVGSVGElement>(".k-doc-dl-cross");
      if (arrow) {
        arrow.style.transition = "";
        arrow.style.opacity = "";
        arrow.style.transform = "";
      }
      if (cross) {
        cross.style.transition = "";
        cross.style.opacity = "";
        cross.style.transform = "";
      }
      pieces.shaft.style.strokeWidth = "";
      pieces.dot.style.visibility = "";
      cacheRef.current.clear();
      drawArrowAtRest(pieces, cacheRef.current);
      renderLine(pieces, 0, 0, cacheRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, progress, gone]);

  if (gone) return null;

  return (
    <span className="k-doc-dl" ref={containerRef} aria-hidden="true">
      <span className="k-doc-dl-disc" />
      <svg className="k-doc-dl-arrow" viewBox="0 0 54 54">
        <path className="k-doc-dl-base" d={BASE_PATH} />
        <path
          className="k-doc-dl-shaft"
          d={J_PATH}
          strokeDasharray={SHAFT_REST_DASHARRAY}
          strokeDashoffset={SHAFT_REST_OFFSET}
        />
        {ARM_PATHS.map((d) => (
          <path className="k-doc-dl-arm" key={d} d={d} />
        ))}
      </svg>
      <svg className="k-doc-dl-cross" viewBox="0 0 54 54">
        <path d={CROSS_PATH} />
      </svg>
      <span className="k-doc-dl-spin">
        <svg className="k-doc-dl-ring" viewBox="0 0 54 54">
          {DOT_PATHS.map((d, index) => (
            <path
              className="k-doc-dl-dot"
              key={d}
              d={d}
              data-dot={index}
              opacity=".35"
              style={{ animationDelay: `${index * WAVE_STEP}ms` }}
            />
          ))}
          <circle
            className="k-doc-dl-line"
            cx="27"
            cy="27"
            r="19"
            transform="rotate(-90 27 27)"
            strokeDasharray={`0 ${Math.round(CIRCUMFERENCE * 100) / 100}`}
            opacity="0"
          />
        </svg>
      </span>
    </span>
  );
}

