import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { Icon } from "../../ui";
import { withThemeParams } from "../../lib/miniAppTheme";
import type { MiniAppLaunch } from "../../types";
import "./mini-app-overlay.css";

/**
 * In-app mini app overlay — Telegram Web K "browser panel" analogue.
 *
 * A non-modal floating panel: it is portalled to `<body>` as a `position: fixed`
 * layer whose root has `pointer-events: none`, so the chat behind stays visible
 * and fully interactive (no scrim, outside clicks are not intercepted). The
 * panel itself re-enables pointer events.
 *
 * Geometry follows Web K (`browser.module.scss`): 480x688, radius 24, header
 * 48px, translucent panel wash at 65% with a 20px backdrop blur, collapsed
 * 328x48, min resized 328x~485, drag by the header only, 8 resize strips,
 * clamped to the `.g-window-body` rectangle. Light/dark colours are scoped by
 * `data-appearance` so the panel matches the F tokens regardless of portals.
 *
 * The iframe is mounted exactly once per launch (plus explicit reloads) so
 * minimising never reloads the web app: the body keeps its pre-collapse inline
 * width/height and is only clipped by the 48px-tall panel. The iframe gets Web
 * K's sandbox/allow list; `tgWebAppThemeParams` is injected into the URL hash
 * only when the server did not already provide it.
 *
 * v1 has no `web_app_ready`/`postMessage` bridge: a navigation `load` event is
 * the only "ready" signal we have, so a frame blocked by X-Frame-Options can
 * still report itself loaded with an error document. The watchdog plus the
 * "Open in browser" escape hatch is the documented fallback (phase 2 adds the
 * bridge). Escape cannot be observed while the cross-origin iframe document
 * owns keyboard focus; it closes the panel only while our chrome has focus.
 *
 * A `data-*` verification surface is kept intentionally small:
 * `[data-miniapp="overlay"]` (panel), `data-state="expanded|minimized"`,
 * `[data-miniapp-action]` on every header action, `[data-miniapp-frame]`.
 */
export interface MiniAppOverlayProps {
  /** App to show; `null` renders nothing. */
  app: MiniAppLaunch | null;
  /** Resolved app appearance — used for the panel wash and theme fallback. */
  appearance: "light" | "dark";
  onClose: () => void;
  onToast?: (message: string) => void;
  /** External-browser fallback hook; receives the hash-stripped URL. */
  onOpenLink?: (url: string) => void;
  /** Recently opened apps for the header `+` popover. */
  recents?: MiniAppLaunch[];
}

const NORMAL_WIDTH = 480;
const NORMAL_HEIGHT = 688;
const HEADER_HEIGHT = 48;
const COLLAPSED_WIDTH = 328;
const COLLAPSED_HEIGHT = 48;
const MIN_WIDTH = 328;
const MIN_HEIGHT = 485;
const EDGE_GAP = 8;
const LOAD_TIMEOUT_MS = 25_000;
const CLOSE_ANIMATION_MS = 180;
const MAX_RECENTS = 5;

/** Web K's iframe sandbox for regular mini apps (games use a different set). */
const SANDBOX_ATTR = [
  "allow-scripts",
  "allow-same-origin",
  "allow-popups",
  "allow-forms",
  "allow-modals",
  "allow-storage-access-by-user-activation",
  "allow-pointer-lock",
].join(" ");

/** Web K's iframe permissions delegate. */
const ALLOW_ATTR =
  "camera; microphone; geolocation; accelerometer; gyroscope; magnetometer; device-orientation; clipboard-write";

const RESIZE_SIDES = ["n", "e", "s", "w", "ne", "nw", "se", "sw"] as const;
type ResizeSide = (typeof RESIZE_SIDES)[number];

const RESIZE_CURSOR: Record<ResizeSide, string> = {
  n: "row-resize",
  s: "row-resize",
  e: "col-resize",
  w: "col-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startBox: Box;
} & ({ mode: "drag" } | { mode: "resize"; side: ResizeSide });

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
}

function measureBounds(): Bounds {
  const host = document.querySelector<HTMLElement>(".g-window-body");
  const rect = host?.getBoundingClientRect();
  if (rect && rect.width > 0 && rect.height > 0) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function clampExpandedBox(box: Box, bounds: Bounds): Box {
  const w = Math.max(MIN_WIDTH, Math.min(box.w, bounds.width - EDGE_GAP * 2));
  const h = Math.max(MIN_HEIGHT, Math.min(box.h, bounds.height - EDGE_GAP * 2));
  return {
    x: clamp(box.x, bounds.left + EDGE_GAP, bounds.left + bounds.width - w - EDGE_GAP),
    y: clamp(box.y, bounds.top + EDGE_GAP, bounds.top + bounds.height - h - EDGE_GAP),
    w,
    h,
  };
}

function collapsedPosition(box: Box, bounds: Bounds): { x: number; y: number } {
  return {
    x: clamp(
      box.x,
      bounds.left + EDGE_GAP,
      bounds.left + bounds.width - COLLAPSED_WIDTH - EDGE_GAP,
    ),
    y: clamp(
      box.y,
      bounds.top + EDGE_GAP,
      bounds.top + bounds.height - COLLAPSED_HEIGHT - EDGE_GAP,
    ),
  };
}

function centeredBox(bounds: Bounds): Box {
  const w = Math.max(MIN_WIDTH, Math.min(NORMAL_WIDTH, bounds.width - EDGE_GAP * 2));
  const h = Math.max(MIN_HEIGHT, Math.min(NORMAL_HEIGHT, bounds.height - EDGE_GAP * 2));
  return clampExpandedBox(
    {
      x: bounds.left + Math.max(EDGE_GAP, Math.round((bounds.width - w) / 2)),
      y: bounds.top + Math.max(EDGE_GAP, Math.round((bounds.height - h) / 2)),
      w,
      h,
    },
    bounds,
  );
}

function resizeBox(start: Box, side: ResizeSide, dx: number, dy: number, bounds: Bounds): Box {
  const minX = bounds.left + EDGE_GAP;
  const minY = bounds.top + EDGE_GAP;
  const maxRight = bounds.left + bounds.width - EDGE_GAP;
  const maxBottom = bounds.top + bounds.height - EDGE_GAP;
  const right = start.x + start.w;
  const bottom = start.y + start.h;

  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;

  if (side.includes("e")) {
    w = clamp(right + dx, start.x + MIN_WIDTH, maxRight) - start.x;
  }
  if (side.includes("s")) {
    h = clamp(bottom + dy, start.y + MIN_HEIGHT, maxBottom) - start.y;
  }
  if (side.includes("w")) {
    const nextX = clamp(start.x + dx, minX, right - MIN_WIDTH);
    w = right - nextX;
    x = nextX;
  }
  if (side.includes("n")) {
    const nextY = clamp(start.y + dy, minY, bottom - MIN_HEIGHT);
    h = bottom - nextY;
    y = nextY;
  }

  return { x, y, w: Math.max(w, MIN_WIDTH), h: Math.max(h, MIN_HEIGHT) };
}

function sameLaunch(a: MiniAppLaunch, b: MiniAppLaunch): boolean {
  return (
    a.url === b.url &&
    a.title === b.title &&
    a.botName === b.botName &&
    a.avatarUrl === b.avatarUrl &&
    a.fromBotMenu === b.fromBotMenu
  );
}

/** Only plain http(s) URLs may be mounted in the sandboxed iframe. */
function isEmbeddableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * URL for the system browser: the launch URL carries the signed Telegram
 * session data in its hash, which must never leak into a browser history.
 */
function externalBrowserUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * In-app Telegram Web K-style mini app panel. Rendered by App above the shell
 * when a bot Web App is launched; closing is owned by the parent.
 */
export function MiniAppOverlay({
  app,
  appearance,
  onClose,
  onToast,
  onOpenLink,
  recents,
}: MiniAppOverlayProps) {
  const { t } = useTranslation();

  // The panel can also switch between apps through the `+` recents popover
  // without asking the parent (the API has no "reopen" callback): `view` is the
  // visible app, synchronised from `app` whenever the parent launches a new one.
  const [view, setView] = useState<MiniAppLaunch | null>(() => app);
  const [box, setBox] = useState<Box>(() => centeredBox(measureBounds()));
  const [bounds, setBounds] = useState<Bounds>(() => measureBounds());
  const [minimized, setMinimized] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState({
    w: NORMAL_WIDTH,
    h: NORMAL_HEIGHT - HEADER_HEIGHT,
  });
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [gestureMode, setGestureMode] = useState<"drag" | ResizeSide | null>(null);
  const [exiting, setExiting] = useState(false);

  const panelRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const appsButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const wasOpenRef = useRef(false);
  const appearanceRef = useRef(appearance);
  const boundsRef = useRef(bounds);

  appearanceRef.current = appearance;
  boundsRef.current = bounds;

  const restoreFocus = useCallback(() => {
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    if (target && target.isConnected) {
      target.focus({ preventScroll: true });
    }
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const markLoaded = useCallback(() => {
    clearWatchdog();
    setLoaded(true);
    setTimedOut(false);
  }, [clearWatchdog]);

  const handleFrameError = useCallback(() => {
    clearWatchdog();
    setLoaded(false);
    setTimedOut(true);
  }, [clearWatchdog]);

  // Fade the panel out, then let the parent drop the launch state (which re-arms
  // the iframe teardown). If the parent keeps us mounted, the app=null effect
  // below removes the panel right after `onClose` lands.
  const requestClose = useCallback(() => {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    setAppsOpen(false);
    setExiting(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, CLOSE_ANIMATION_MS);
  }, [onClose]);

  const reloadFrame = useCallback(() => {
    setAppsOpen(false);
    setLoaded(false);
    setTimedOut(false);
    setAvatarFailed(false);
    setReloadNonce((value) => value + 1);
  }, []);

  const openInBrowser = useCallback(() => {
    setAppsOpen(false);
    const url = view ? externalBrowserUrl(view.url) : null;
    if (!url) {
      onToast?.(t("miniAppOverlay.failed"));
      return;
    }
    if (onOpenLink) {
      onOpenLink(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    onToast?.(t("miniAppOverlay.browserNote"));
  }, [view, onOpenLink, onToast, t]);

  // The parent owns the launch state: a new launch replaces the current app,
  // while a plain re-render with the same app must not reset or reload it.
  useEffect(() => {
    if (!app) {
      return;
    }
    setView((current) => (current && sameLaunch(current, app) ? current : app));
  }, [app]);

  // The parent closed the app (or never opened one). Animate out, then drop the
  // iframe. When the close came from requestClose the parent already waited for
  // the fade, so the panel is removed immediately.
  useEffect(() => {
    if (app || !view) {
      return;
    }
    if (closingRef.current) {
      closingRef.current = false;
      setView(null);
      setExiting(false);
      restoreFocus();
      return;
    }
    closingRef.current = true;
    setExiting(true);
    const timer = window.setTimeout(() => {
      closingRef.current = false;
      setView(null);
      setExiting(false);
      restoreFocus();
    }, CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [app, view, restoreFocus]);

  // First mount of a session: capture the opener for focus restore, centre the
  // panel inside the window content and move keyboard focus into the chrome so
  // Escape works without trapping the user (the panel is not modal).
  useEffect(() => {
    if (!view) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = true;
    closingRef.current = false;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setExiting(false);
    setMinimized(false);
    setAppsOpen(false);
    // Re-measure after commit: on a first mount the host (`.g-window-body`) may
    // not be laid out yet when the initial state factory runs.
    const measured = measureBounds();
    boundsRef.current = measured;
    setBounds(measured);
    setBox(centeredBox(measured));
    focusFrameRef.current = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [view]);

  // One iframe document per session; the theme is captured at open time so a
  // light/dark switch never reloads the running web app (v1 has no bridge to
  // send `theme_changed`).
  useEffect(() => {
    if (!view) {
      setFrameSrc(null);
      return;
    }
    if (!isEmbeddableUrl(view.url)) {
      setFrameSrc(null);
      setTimedOut(true);
      return;
    }
    setFrameSrc(withThemeParams(view.url, appearanceRef.current));
    setLoaded(false);
    setTimedOut(false);
    setAvatarFailed(false);
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
    }
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      setTimedOut(true);
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [view, reloadNonce]);

  // Bounds follow the window content rect (titlebar excluded) and the panel is
  // re-clamped whenever the window is resized.
  useEffect(() => {
    const onResize = () => {
      const next = measureBounds();
      setBounds(next);
      setBox((current) =>
        minimized
          ? {
              ...current,
              ...collapsedPosition(current, next),
            }
          : clampExpandedBox(current, next),
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minimized]);

  // Escape closes the panel (Web A modal semantics) unless an editable element
  // outside the panel owns focus, where Escape belongs to the chat UI. Escape
  // pressed inside the cross-origin iframe never reaches this listener.
  useEffect(() => {
    if (!view) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (document.activeElement === iframeRef.current) {
        return;
      }
      if (appsOpen) {
        event.preventDefault();
        setAppsOpen(false);
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        !panelRef.current?.contains(active) &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, appsOpen, requestClose]);

  // Click outside closes only the "Apps" popover (the panel itself is non-modal
  // and is not dismissed by clicks on the chat).
  useEffect(() => {
    if (!appsOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (popoverRef.current?.contains(target) || appsButtonRef.current?.contains(target)) {
        return;
      }
      setAppsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [appsOpen]);

  // Drag/resize gesture: pointer capture is taken on the header/handle so the
  // cross-origin iframe can never swallow pointer moves; a transparent shield is
  // painted over the panel as a second line of defence.
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (gesture.mode === "drag") {
        const next = boundsRef.current;
        const w = gesture.startBox.w;
        const h = gesture.startBox.h;
        setBox((current) => ({
          ...current,
          x: clamp(gesture.startBox.x + dx, next.left + EDGE_GAP, next.left + next.width - w - EDGE_GAP),
          y: clamp(gesture.startBox.y + dy, next.top + EDGE_GAP, next.top + next.height - h - EDGE_GAP),
        }));
        return;
      }
      setBox(resizeBox(gesture.startBox, gesture.side, dx, dy, boundsRef.current));
    };
    const endGesture = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }
      gestureRef.current = null;
      setGestureMode(null);
    };
    const cancelGesture = () => {
      if (gestureRef.current) {
        gestureRef.current = null;
        setGestureMode(null);
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endGesture);
    window.addEventListener("pointercancel", cancelGesture);
    window.addEventListener("blur", cancelGesture);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endGesture);
      window.removeEventListener("pointercancel", cancelGesture);
      window.removeEventListener("blur", cancelGesture);
      gestureRef.current = null;
    };
  }, []);

  // Unmount safety net: clear timers, focus frame and restore the opener.
  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
      }
      restoreFocus();
    },
    [restoreFocus],
  );

  // A collapsed panel must not leave the iframe document reachable by Tab or
  // assistive tech even though it stays mounted (and loaded).
  useEffect(() => {
    bodyRef.current?.toggleAttribute("inert", minimized);
  }, [minimized, view]);

  const toggleMinimize = useCallback(() => {
    setAppsOpen(false);
    if (minimized) {
      setMinimized(false);
      setBox((current) => clampExpandedBox(current, boundsRef.current));
      window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
      return;
    }
    setFrozenFrame({ w: box.w, h: Math.max(0, box.h - HEADER_HEIGHT) });
    setMinimized(true);
  }, [box.h, box.w, minimized]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || exiting) {
      return;
    }
    const target = event.target;
    // `element.closest` works for SVG icon children too (they are Elements, not
    // HTMLElements), so pressing the icon inside a header button is ignored.
    if (
      target instanceof Element &&
      target.closest("button, a, input, [role='menu'], [role='menuitem'], .ma-apps-popover")
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      mode: "drag",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startBox: minimized
        ? {
            ...collapsedPosition(box, bounds),
            w: COLLAPSED_WIDTH,
            h: COLLAPSED_HEIGHT,
          }
        : box,
    };
    setGestureMode("drag");
    setAppsOpen(false);
  };

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>, side: ResizeSide) => {
    if (event.button !== 0 || minimized || exiting) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      mode: "resize",
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startBox: box,
    };
    setGestureMode(side);
  };

  const openRecent = (launch: MiniAppLaunch) => {
    setAppsOpen(false);
    closingRef.current = false;
    setExiting(false);
    setMinimized(false);
    setLoaded(false);
    setTimedOut(false);
    setAvatarFailed(false);
    setReloadNonce(0);
    setView(launch);
    window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
  };

  const handlePopoverKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"),
    );
    if (items.length === 0) {
      return;
    }
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (index + 1 + items.length) % items.length
        : (index - 1 + items.length) % items.length;
    event.preventDefault();
    items[next]?.focus();
  };

  const recentItems = useMemo(() => {
    const seen = new Set<string>();
    const items: MiniAppLaunch[] = [];
    for (const item of recents ?? []) {
      if (!item?.url || seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      items.push(item);
      if (items.length >= MAX_RECENTS) {
        break;
      }
    }
    return items;
  }, [recents]);

  if (!view) {
    return null;
  }

  const title = view.title?.trim() || view.botName?.trim() || t("miniAppOverlay.fallbackTitle");
  const showAvatar = Boolean(view.avatarUrl) && !avatarFailed;
  const ariaLabel = t("miniAppOverlay.aria", { name: title });

  const expandedFrame = { w: box.w, h: Math.max(0, box.h - HEADER_HEIGHT) };
  const frameBox = minimized ? frozenFrame : expandedFrame;
  const collapsed = minimized ? collapsedPosition(box, bounds) : null;
  const panelStyle: CSSProperties = {
    left: collapsed ? collapsed.x : box.x,
    top: collapsed ? collapsed.y : box.y,
    width: collapsed ? COLLAPSED_WIDTH : box.w,
    height: collapsed ? COLLAPSED_HEIGHT : box.h,
  };
  const bodyStyle: CSSProperties = { width: frameBox.w, height: frameBox.h };

  return createPortal(
    <div className="ma-layer" data-appearance={appearance}>
      <section
        ref={panelRef}
        className={cn(
          "ma-panel",
          minimized && "is-collapsed",
          gestureMode && "is-gesturing",
          exiting && "is-exiting",
        )}
        style={panelStyle}
        role="dialog"
        aria-modal="false"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-miniapp="overlay"
        data-state={minimized ? "minimized" : "expanded"}
        data-loaded={loaded ? "true" : undefined}
        data-timed-out={timedOut ? "true" : undefined}
      >
        <header className="ma-header" onPointerDown={beginDrag}>
          <button
            type="button"
            className="ma-header-btn ma-close"
            data-miniapp-action="close"
            aria-label={t("miniAppOverlay.close")}
            title={t("miniAppOverlay.close")}
            onClick={requestClose}
          >
            <Icon name="close" size={18} />
          </button>

          <div className="ma-tab" title={title}>
            {showAvatar ? (
              <img
                className="ma-avatar"
                src={view.avatarUrl}
                alt=""
                draggable={false}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span className="ma-avatar ma-avatar-fallback" aria-hidden="true">
                <Icon name="bot" size={15} />
              </span>
            )}
            <span className="ma-title" dir="auto">
              {title}
            </span>
          </div>

          <div className="ma-spacer" />

          <button
            ref={appsButtonRef}
            type="button"
            className="ma-header-btn ma-apps-btn"
            data-miniapp-action="apps"
            aria-label={t("miniAppOverlay.openApp")}
            title={t("miniAppOverlay.openApp")}
            aria-haspopup="menu"
            aria-expanded={appsOpen}
            onClick={() => setAppsOpen((open) => !open)}
          >
            <Icon name="add" size={20} />
          </button>

          <button
            type="button"
            className="ma-header-btn"
            data-miniapp-action={minimized ? "restore" : "minimize"}
            aria-label={t(minimized ? "miniAppOverlay.restore" : "miniAppOverlay.minimize")}
            title={t(minimized ? "miniAppOverlay.restore" : "miniAppOverlay.minimize")}
            onClick={toggleMinimize}
          >
            <Icon name={minimized ? "fullscreen" : "fullscreen_exit"} size={17} />
          </button>

          {appsOpen && !minimized ? (
            <div
              ref={popoverRef}
              className="ma-apps-popover"
              data-miniapp-popover="apps"
              role="menu"
              aria-label={t("miniAppOverlay.openApp")}
              onKeyDown={handlePopoverKeyDown}
            >
              <div className="ma-apps-heading" role="presentation">
                {t("miniAppOverlay.recentApps")}
              </div>
              {recentItems.length === 0 ? (
                <div className="ma-apps-empty" role="presentation">
                  {t("miniAppOverlay.noRecentApps")}
                </div>
              ) : (
                recentItems.map((item) => {
                  const itemTitle =
                    item.title?.trim() ||
                    item.botName?.trim() ||
                    t("miniAppOverlay.fallbackTitle");
                  return (
                    <button
                      key={item.url}
                      type="button"
                      role="menuitem"
                      className="ma-apps-item"
                      data-miniapp-action="recent"
                      onClick={() => openRecent(item)}
                    >
                      {item.avatarUrl ? (
                        <img
                          className="ma-apps-item-avatar"
                          src={item.avatarUrl}
                          alt=""
                          draggable={false}
                        />
                      ) : (
                        <span className="ma-apps-item-avatar" aria-hidden="true">
                          <Icon name="bot" size={15} />
                        </span>
                      )}
                      <span className="ma-apps-item-label">
                        <span className="ma-apps-item-title" dir="auto">
                          {itemTitle}
                        </span>
                        {item.botName && item.botName !== itemTitle ? (
                          <span className="ma-apps-item-sub" dir="auto">
                            {item.botName}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
              <div className="ma-apps-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="ma-apps-action"
                data-miniapp-action="reload"
                onClick={reloadFrame}
              >
                <Icon name="refresh" size={16} />
                <span>{t("miniAppOverlay.reload")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="ma-apps-action"
                data-miniapp-action="open-browser"
                onClick={openInBrowser}
              >
                <Icon name="open_in_new" size={16} />
                <span>{t("miniAppOverlay.openInBrowser")}</span>
              </button>
            </div>
          ) : null}
        </header>

        <div ref={bodyRef} className="ma-body" style={bodyStyle}>
          {frameSrc ? (
            <iframe
              ref={iframeRef}
              key={`${frameSrc}:${reloadNonce}`}
              className={cn("ma-frame", loaded && !timedOut && "is-loaded")}
              src={frameSrc}
              title={title}
              sandbox={SANDBOX_ATTR}
              allow={ALLOW_ATTR}
              referrerPolicy="no-referrer"
              allowFullScreen
              data-miniapp-frame=""
              onLoad={markLoaded}
              onError={handleFrameError}
            />
          ) : null}

          {!loaded && !timedOut ? (
            <div className="ma-loading" data-miniapp-loading="">
              <span className="ma-loading-avatar" aria-hidden="true">
                {showAvatar ? (
                  <img src={view.avatarUrl} alt="" draggable={false} />
                ) : (
                  <Icon name="bot" size={34} />
                )}
              </span>
              <span className="ma-loading-name" dir="auto">
                {title}
              </span>
              <span className="ma-loading-text">{t("miniAppOverlay.loading")}</span>
              <span className="ma-spinner" aria-hidden="true" />
            </div>
          ) : null}

          {timedOut || !frameSrc ? (
            <div className="ma-error" data-miniapp-error="" role="alert">
              <span className="ma-error-icon" aria-hidden="true">
                <Icon name="warning" size={24} />
              </span>
              <span className="ma-error-title">{t("miniAppOverlay.failed")}</span>
              <span className="ma-error-text">{t("miniAppOverlay.blocked")}</span>
              <span className="ma-error-note">{t("miniAppOverlay.browserNote")}</span>
              <span className="ma-error-actions">
                <button
                  type="button"
                  className="ma-btn"
                  data-miniapp-action="error-reload"
                  onClick={reloadFrame}
                >
                  <Icon name="refresh" size={15} />
                  <span>{t("miniAppOverlay.reload")}</span>
                </button>
                <button
                  type="button"
                  className="ma-btn ma-btn-primary"
                  data-miniapp-action="error-open-browser"
                  onClick={openInBrowser}
                >
                  <Icon name="open_in_new" size={15} />
                  <span>{t("miniAppOverlay.openInBrowser")}</span>
                </button>
                <button
                  type="button"
                  className="ma-btn"
                  data-miniapp-action="error-close"
                  onClick={requestClose}
                >
                  {t("miniAppOverlay.close")}
                </button>
              </span>
            </div>
          ) : null}
        </div>

        {!minimized && !exiting
          ? RESIZE_SIDES.map((side) => (
              <div
                key={side}
                className="ma-resize"
                data-side={side}
                data-miniapp-resize={side}
                onPointerDown={(event) => beginResize(event, side)}
              />
            ))
          : null}

        {gestureMode ? (
          <div
            className="ma-shield"
            data-miniapp-shield={gestureMode}
            style={{ cursor: gestureMode === "drag" ? "grabbing" : RESIZE_CURSOR[gestureMode] }}
            aria-hidden="true"
          />
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
