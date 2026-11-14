import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Message } from "../../types";
import { Icon, Menu, MenuItem, Spinner } from "../../ui";
import { copyImageToClipboard } from "../../lib/mediaClipboard";
import { RichText } from "../chat/MessageBubble";
import { VideoStage } from "./VideoStage";
import { DesktopVideoControls } from "./DesktopVideoControls";
import type { ViewerAuthor, ViewerItem, ViewerSource } from "./types";
import "./media-viewer.css";

export interface MediaViewerProps {
  items: ViewerItem[];
  initialId: number;
  source?: ViewerSource;
  authorOf: (message: Message) => ViewerAuthor;
  onClose: () => void;
  onLoadVideo: (chatId: string, messageId: number) => Promise<string>;
  onDownload?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onShowInChat?: (message: Message) => void;
  onToast?: (message: string) => void;
}

/* Telegram Desktop's viewer geometry: the media sits under a slim top gap and
 * above the measured bottom chrome (caption / album strip / video controls /
 * file info row). */
const VIEWER_TOP_GAP = 12;
const SIDE_GAP = 24;
const MAX_WIDTH_PHOTO = 2400;
const OPEN_DURATION = 200;
const CLOSE_DURATION = 200;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.5;
const SWIPE_NAV_PERCENT = 0.2;
const SWIPE_NAV_PX = 125;
const SWIPE_CLOSE_PERCENT = 0.2;
const SWIPE_CLOSE_PX = 125;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  axis?: "x" | "y";
  moved: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clock(seconds?: number) {
  const value = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = value % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Cached GetVideoStream URLs keyed chatId:messageId (one RPC per message). */
const videoUrlCache = new Map<string, string>();

export function MediaViewer({
  items,
  initialId,
  source,
  authorOf,
  onClose,
  onLoadVideo,
  onDownload,
  onForward,
  onDelete,
  onShowInChat,
  onToast,
}: MediaViewerProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const clickTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const bottomRef = useRef<HTMLElement>(null);
  const chromeTimerRef = useRef<number | undefined>(undefined);

  const [activeId, setActiveId] = useState(initialId);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [rootOrigin, setRootOrigin] = useState({ x: 0, y: 0 });
  // Fullscreen the whole window document so the window caption bar is hidden.
  const viewerFullscreenTarget =
    typeof document === "undefined" ? null : document.documentElement;
  const [opened, setOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeBox, setCloseBox] = useState<Box | null>(null);
  const [slideDirection, setSlideDirection] = useState<0 | 1 | -1>(0);
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoRetry, setPhotoRetry] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [videoUrls, setVideoUrls] = useState<Record<number, string>>({});
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoRetry, setVideoRetry] = useState(0);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(0);
  const [chromeHidden, setChromeHidden] = useState(false);

  const index = useMemo(
    () => items.findIndex((entry) => entry.message.id === activeId),
    [items, activeId],
  );
  const item = index >= 0 ? items[index] : undefined;

  useEffect(() => {
    if (items.length === 0) {
      onClose();
      return;
    }
    if (!items.some((entry) => entry.message.id === activeId)) {
      const next = items[Math.min(Math.max(index, 0), items.length - 1)];
      setActiveId(next.message.id);
    }
  }, [activeId, index, items, onClose]);

  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0 });
    setRotation(0);
    setDragOffset(null);
    setPhotoLoaded(false);
    setThumbLoaded(false);
    setPhotoFailed(false);
    setNaturalSize(null);
    setVideoFailed(false);
    setVideoEl(null);
    setVideoPlaying(false);
    setChromeHidden(false);
  }, [activeId]);

  // The viewer starts below the window caption bar (drag + minimize + close must
  // stay usable), so every measurement is taken from the overlay itself rather
  // than the whole window.
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) {
      return;
    }
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: node.clientWidth, height: node.clientHeight });
      setRootOrigin({ x: rect.left, y: rect.top });
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener("resize", measure);
    document.addEventListener("fullscreenchange", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, []);

  useLayoutEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      restoreFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(
    () => () => {
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current);
      }
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const active = item?.kind === "photo";
  const isVideo = item?.kind === "video" || item?.kind === "video_note";
  const isAnimation = item?.kind === "animation";
  const isNote = item?.kind === "video_note";

  const album = useMemo(() => {
    const groupedId = item?.message.groupedId;
    if (!groupedId) {
      return null;
    }
    let start = index;
    let end = index;
    while (start > 0 && items[start - 1].message.groupedId === groupedId) {
      start -= 1;
    }
    while (end + 1 < items.length && items[end + 1].message.groupedId === groupedId) {
      end += 1;
    }
    if (end - start < 1) {
      return null;
    }
    return { start, end, entries: items.slice(start, end + 1) };
  }, [index, item, items]);

  const stageBox = useMemo(
    () => computeBox(item, viewport, bottomHeight, rotation, naturalSize),
    [bottomHeight, item, naturalSize, rotation, viewport],
  );

  // The bottom chrome overlays the media, so measure it whenever the caption,
  // album strip or video controls change and fit the media above it.
  useLayoutEffect(() => {
    const node = bottomRef.current;
    if (!node) {
      setBottomHeight(0);
      return;
    }
    const measure = () => setBottomHeight(node.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Telegram Desktop fades the chrome while a video plays and the mouse idles.
  const wakeChrome = useCallback(() => {
    setChromeHidden(false);
    if (chromeTimerRef.current) {
      window.clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = undefined;
    }
    if (videoPlaying) {
      chromeTimerRef.current = window.setTimeout(() => setChromeHidden(true), 2600);
    }
  }, [videoPlaying]);

  useEffect(() => {
    wakeChrome();
    return () => {
      if (chromeTimerRef.current) {
        window.clearTimeout(chromeTimerRef.current);
      }
    };
  }, [wakeChrome]);

  useEffect(() => {
    if (videoPlaying) {
      return;
    }
    setChromeHidden(false);
    if (chromeTimerRef.current) {
      window.clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = undefined;
    }
  }, [videoPlaying]);

  useLayoutEffect(() => {
    if (!source || prefersReducedMotion()) {
      setOpened(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => setOpened(true));
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findThumbRect = useCallback(
    (messageId: number): Box | null => {
      const element = document.querySelector<HTMLElement>(
        `[data-media-id="${messageId}"]`,
      );
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        return null;
      }
      const radius =
        Number.parseFloat(window.getComputedStyle(element).borderTopLeftRadius) || 0;
      return {
        left: rect.left - rootOrigin.x,
        top: rect.top - rootOrigin.y,
        width: rect.width,
        height: rect.height,
        radius,
      };
    },
    [rootOrigin.x, rootOrigin.y],
  );

  const close = useCallback(() => {
    if (closing) {
      return;
    }
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = undefined;
    }
    const target = prefersReducedMotion() ? null : findThumbRect(activeId);
    setClosing(true);
    setCloseBox(target);
    setZoom({ scale: 1, x: 0, y: 0 });
    setRotation(0);
    setDragOffset(null);
    closeTimerRef.current = window.setTimeout(
      () => onClose(),
      target ? CLOSE_DURATION : 140,
    );
  }, [activeId, closing, findThumbRect, onClose]);

  const goTo = useCallback(
    (nextIndex: number) => {
      const next = items[nextIndex];
      if (!next || nextIndex === index) {
        return;
      }
      if (prefersReducedMotion()) {
        setActiveId(next.message.id);
        return;
      }
      setSlideDirection(nextIndex > index ? 1 : -1);
      setActiveId(next.message.id);
      window.setTimeout(() => setSlideDirection(0), 220);
    },
    [index, items],
  );

  const go = useCallback(
    (delta: number) => {
      if (closing || index < 0) {
        return;
      }
      const nextIndex = index + delta;
      if (nextIndex >= 0 && nextIndex < items.length) {
        goTo(nextIndex);
      }
    },
    [closing, goTo, index, items.length],
  );

  const isZoomed = Math.abs(zoom.scale - 1) > 0.01;

  const resetZoom = useCallback(() => setZoom({ scale: 1, x: 0, y: 0 }), []);

  const clampPan = useCallback(
    (next: ZoomState): ZoomState => {
      const maxX = Math.max(0, (stageBox.width * (next.scale - 1)) / 2);
      const maxY = Math.max(0, (stageBox.height * (next.scale - 1)) / 2);
      return {
        scale: next.scale,
        x: clamp(next.x, -maxX, maxX),
        y: clamp(next.y, -maxY, maxY),
      };
    },
    [stageBox.height, stageBox.width],
  );

  const zoomStep = useCallback(
    (direction: 1 | -1) => {
      setZoom((current) => {
        const scale = clamp(current.scale + direction * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
        return Math.abs(scale - 1) < 0.001
          ? { scale: 1, x: 0, y: 0 }
          : clampPan({ scale, x: 0, y: 0 });
      });
    },
    [clampPan],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !active) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const originX = event.clientX - (rect.left + rect.width / 2);
      const originY = event.clientY - (rect.top + rect.height / 2);
      setZoom((current) => {
        const factor = Math.exp(-event.deltaY * 0.0016);
        const scale = clamp(current.scale * factor, ZOOM_MIN, ZOOM_MAX);
        const ratio = scale / current.scale;
        if (Math.abs(scale - 1) < 0.001) {
          return { scale: 1, x: 0, y: 0 };
        }
        const maxX = Math.max(0, (stageBox.width * (scale - 1)) / 2);
        const maxY = Math.max(0, (stageBox.height * (scale - 1)) / 2);
        return {
          scale,
          x: clamp(originX - (originX - current.x) * ratio, -maxX, maxX),
          y: clamp(originY - (originY - current.y) * ratio, -maxY, maxY),
        };
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [active, activeId, stageBox.height, stageBox.width]);

  // Viewer keyboard: paging, zoom + close. The video stage owns playback keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      // A Radix dialog (delete confirmation, forward picker) sits above the
      // viewer and owns Escape and arrow keys while it is open.
      if (document.querySelector(".rt-BaseDialogOverlay")) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          close();
          break;
        case "ArrowLeft":
          if (!isZoomed) {
            event.preventDefault();
            go(-1);
          }
          break;
        case "ArrowRight":
          if (!isZoomed) {
            event.preventDefault();
            go(1);
          }
          break;
        case "+":
        case "=":
          if (active && (event.ctrlKey || event.metaKey || !event.altKey)) {
            event.preventDefault();
            zoomStep(1);
          }
          break;
        case "-":
        case "_":
          if (active && (event.ctrlKey || event.metaKey || !event.altKey)) {
            event.preventDefault();
            zoomStep(-1);
          }
          break;
        case "0":
          if (active) {
            event.preventDefault();
            resetZoom();
          }
          break;
        case "Tab": {
          const root = rootRef.current;
          if (!root) {
            return;
          }
          const focusable = Array.from(
            root.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          if (focusable.length === 0) {
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const current = document.activeElement;
          if (!event.shiftKey && current === last) {
            event.preventDefault();
            first.focus();
          } else if (event.shiftKey && (current === first || current === root)) {
            event.preventDefault();
            last.focus();
          }
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, close, go, isZoomed, resetZoom, zoomStep]);

  useEffect(() => {
    if (!item || (item.kind !== "video" && item.kind !== "video_note")) {
      return;
    }
    const messageId = item.message.id;
    const key = `${item.message.chatId}:${messageId}`;
    const cached = videoUrlCache.get(key);
    if (cached) {
      setVideoUrls((current) =>
        current[messageId] === cached ? current : { ...current, [messageId]: cached },
      );
      setVideoLoading(false);
      return;
    }
    let cancelled = false;
    setVideoLoading(true);
    setVideoFailed(false);
    void onLoadVideo(item.message.chatId, messageId)
      .then((url) => {
        if (!url) {
          throw new Error("empty url");
        }
        videoUrlCache.set(key, url);
        if (!cancelled) {
          setVideoUrls((current) => ({ ...current, [messageId]: url }));
          setVideoLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVideoLoading(false);
          setVideoFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item, onLoadVideo, videoRetry]);

  const retryVideo = useCallback(() => {
    if (!item) {
      return;
    }
    videoUrlCache.delete(`${item.message.chatId}:${item.message.id}`);
    setVideoFailed(false);
    setVideoUrls((current) => {
      const next = { ...current };
      delete next[item.message.id];
      return next;
    });
    setVideoRetry((value) => value + 1);
  }, [item]);

  const captionEntry = useMemo(() => {
    if (!album) {
      return item;
    }
    return album.entries.find((entry) => entry.message.text?.trim()) ?? item;
  }, [album, item]);
  const captionText = captionEntry?.message.text?.trim() ?? "";

  const author = item ? authorOf(item.message) : undefined;
  const videoUrl = item ? videoUrls[item.message.id] : undefined;

  const closeRef = useRef(close);
  closeRef.current = close;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || closing || event.button !== 0) {
      return;
    }
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = undefined;
    }
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!active || closing || !drag) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) {
      return;
    }
    drag.moved = true;
    if (isZoomed) {
      return;
    }
    if (!drag.axis) {
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (drag.axis === "x") {
      const atEdge = (index === 0 && dx > 0) || (index === items.length - 1 && dx < 0);
      setDragOffset({ x: dx * (atEdge ? 0.3 : 1), y: 0 });
    } else {
      setDragOffset({ x: 0, y: dy });
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!active) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag?.moved || !drag.axis || isZoomed) {
      setDragOffset(null);
      return;
    }
    // The click that ends a drag must not close the viewer.
    suppressClickRef.current = true;
    const offset = dragOffset;
    setDragOffset(null);
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    if (drag.axis === "x") {
      const dx = offset?.x ?? 0;
      if (
        Math.abs(dx) > viewportWidth * SWIPE_NAV_PERCENT ||
        Math.abs(dx) > SWIPE_NAV_PX
      ) {
        go(dx < 0 ? 1 : -1);
      }
      return;
    }
    const dy = offset?.y ?? 0;
    if (
      Math.abs(dy) > viewportHeight * SWIPE_CLOSE_PERCENT ||
      Math.abs(dy) > SWIPE_CLOSE_PX
    ) {
      closeRef.current();
    }
  };

  const onDoubleClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || closing) {
      return;
    }
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = undefined;
    }
    if (isZoomed) {
      resetZoom();
      return;
    }
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const rect = stage.getBoundingClientRect();
    setZoom((current) => {
      const originX = event.clientX - (rect.left + rect.width / 2);
      const originY = event.clientY - (rect.top + rect.height / 2);
      const scale = Math.min(ZOOM_MAX, current.scale + 2);
      return {
        scale,
        x: clamp(-originX * (scale - 1), -(rect.width * (scale - 1)) / 2, (rect.width * (scale - 1)) / 2),
        y: clamp(-originY * (scale - 1), -(rect.height * (scale - 1)) / 2, (rect.height * (scale - 1)) / 2),
      };
    });
  };

  const stageTransform = useMemo(() => {
    if (!active) {
      return undefined;
    }
    const parts: string[] = [];
    const dx = dragOffset?.x ?? 0;
    const dy = dragOffset?.y ?? 0;
    if (isZoomed) {
      parts.push(`translate3d(${zoom.x}px, ${zoom.y}px, 0)`);
      parts.push(`scale(${zoom.scale})`);
    }
    if (rotation !== 0) {
      parts.push(`rotate(${rotation}deg)`);
    }
    if (isZoomed || rotation !== 0) {
      return parts.join(" ");
    }
    if (dx || dy) {
      return `translate3d(${dx}px, ${dy}px, 0)`;
    }
    return undefined;
  }, [active, dragOffset, isZoomed, rotation, zoom.scale, zoom.x, zoom.y]);

  const stageStyle: CSSProperties = useMemo(() => {
    if (closing && closeBox) {
      return {
        left: closeBox.left,
        top: closeBox.top,
        width: closeBox.width,
        height: closeBox.height,
        borderRadius: closeBox.radius,
        transitionDuration: `${CLOSE_DURATION}ms`,
      };
    }
    if (!opened && source) {
      return {
        left: source.left - rootOrigin.x,
        top: source.top - rootOrigin.y,
        width: source.width,
        height: source.height,
        borderRadius: source.radius,
        transitionDuration: `${OPEN_DURATION}ms`,
      };
    }
    if (!opened) {
      return {
        left: stageBox.left,
        top: stageBox.top,
        width: stageBox.width,
        height: stageBox.height,
        borderRadius: stageBox.radius,
        opacity: 0,
        transitionDuration: `${OPEN_DURATION}ms`,
      };
    }
    return {
      left: stageBox.left,
      top: stageBox.top,
      width: stageBox.width,
      height: stageBox.height,
      borderRadius: stageBox.radius,
      transitionDuration: `${OPEN_DURATION}ms`,
    };
  }, [closeBox, closing, opened, rootOrigin.x, rootOrigin.y, source, stageBox]);

  if (!item) {
    return null;
  }

  const isFirst = index <= 0;
  const isLast = index >= items.length - 1;

  // Telegram Desktop's bottom-left copy: a bold header (file name for videos,
  // "N / M" for photo lists) and the sender + date line under it.
  const headerText =
    isVideo || isAnimation || isNote
      ? item.name || (item.duration ? clock(item.duration) : "")
      : items.length > 1
        ? t("viewer.position", { position: index + 1, count: items.length })
        : item.name || t("media.photo");
  const dateLine = `${item.message.date} ${item.message.time}`;

  const copyImage = () => {
    const media = item.message.media;
    const url = media?.photoUrl || media?.thumbUrl;
    if (!url) {
      onToast?.(t("viewer.copyFailed"));
      return;
    }
    void copyImageToClipboard(url).then((copied) =>
      onToast?.(copied ? t("viewer.copiedImage") : t("viewer.copyFailed")),
    );
  };

  const copyCaption = () => {
    if (!captionText) {
      return;
    }
    void navigator.clipboard
      .writeText(captionText)
      .then(() => onToast?.(t("viewer.copiedText")))
      .catch(() => onToast?.(t("viewer.copyFailed")));
  };

  const content = (
    <div
      ref={rootRef}
      className="mv-root"
      data-chrome={chromeHidden || undefined}
      data-opening={!opened || undefined}
      data-closing={closing || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={t("viewer.title")}
      tabIndex={-1}
      onMouseMove={wakeChrome}
      onPointerDown={wakeChrome}
    >
      <div className="mv-backdrop" onClick={close} aria-hidden="true" />

      {!isFirst ? (
        <button
          type="button"
          className="mv-switcher mv-switcher--prev"
          onClick={() => go(-1)}
          aria-label={t("viewer.previous")}
          title={t("viewer.previous")}
          data-hidden={isZoomed || undefined}
        >
          <Icon name="chevron_left" size={54} />
        </button>
      ) : null}
      {!isLast ? (
        <button
          type="button"
          className="mv-switcher mv-switcher--next"
          onClick={() => go(1)}
          aria-label={t("viewer.next")}
          title={t("viewer.next")}
          data-hidden={isZoomed || undefined}
        >
          <Icon name="chevron_right" size={54} />
        </button>
      ) : null}

      <div className="mv-page">
        <div
          key={item.message.id}
          ref={stageRef}
          className="mv-stage"
          data-kind={item.kind}
          data-slide={slideDirection === 1 ? "next" : slideDirection === -1 ? "prev" : undefined}
          data-dragging={dragOffset ? "true" : undefined}
          data-round={isNote || undefined}
          data-zoomed={isZoomed || undefined}
          style={stageStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={onDoubleClick}
        >
          {!active && item.thumbUrl ? (
            <img
              className="mv-stage-poster"
              src={item.thumbUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          {active ? (
            <div className="mv-transform" style={{ transform: stageTransform }}>
              {item.thumbUrl ? (
                <img
                  className="mv-photo mv-photo--thumb"
                  src={item.thumbUrl}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  onLoad={() => setThumbLoaded(true)}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              {item.imageUrl || item.thumbUrl ? (
                <img
                  key={`${item.message.id}:${photoRetry}`}
                  className="mv-photo"
                  src={item.imageUrl || item.thumbUrl}
                  alt={item.message.media?.name ?? t("media.photo")}
                  draggable={false}
                  data-loaded={photoLoaded || undefined}
                  onLoad={(event) => {
                    setPhotoLoaded(true);
                    setPhotoFailed(false);
                    const node = event.currentTarget;
                    if (!item.width && !item.height && node.naturalWidth > 0) {
                      setNaturalSize({
                        width: node.naturalWidth,
                        height: node.naturalHeight,
                      });
                    }
                  }}
                  onError={() => setPhotoFailed(true)}
                />
              ) : null}
            </div>
          ) : null}

          {isVideo && videoUrl ? (
            <div
              className="mv-rotator"
              style={{ transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined }}
            >
              <VideoStage
                key={`${item.message.id}:${videoRetry}`}
                src={videoUrl}
                poster={item.thumbUrl}
                width={item.width}
                height={item.height}
                duration={item.duration}
                autoPlay
                loop={isNote || (item.duration ?? 0) < 60}
                chromeless
                fullscreenTarget={viewerFullscreenTarget}
                onToast={onToast}
                onVideoElement={setVideoEl}
              />
            </div>
          ) : null}
          {isAnimation && item.streamUrl ? (
            <div className="mv-rotator">
              <VideoStage
                key={item.message.id}
                src={item.streamUrl}
                poster={item.thumbUrl}
                width={item.width}
                height={item.height}
                duration={item.duration}
                autoPlay
                loop
                isAnimation
                fullscreenTarget={viewerFullscreenTarget}
                onToast={onToast}
              />
            </div>
          ) : null}

          {isVideo && (videoLoading || !videoUrl) && !videoFailed ? (
            <div className="mv-stage-status">
              <Spinner size={26} />
              <span>{t("viewer.videoLoading")}</span>
            </div>
          ) : null}
          {isVideo && videoFailed ? (
            <div className="mv-stage-status">
              <Icon name="error" size={26} />
              <span>{t("viewer.videoError")}</span>
              <button type="button" className="mv-text-btn" onClick={retryVideo}>
                {t("viewer.retry")}
              </button>
            </div>
          ) : null}
          {active && !photoLoaded && !thumbLoaded && !photoFailed ? (
            <div className="mv-stage-status">
              <Spinner size={26} />
              <span>{t("viewer.loading")}</span>
            </div>
          ) : null}
          {active && photoFailed ? (
            <div className="mv-stage-status">
              <Icon name="error" size={26} />
              <span>{t("viewer.videoError")}</span>
              <button
                type="button"
                className="mv-text-btn"
                onClick={() => {
                  setPhotoFailed(false);
                  setPhotoRetry((value) => value + 1);
                }}
              >
                {t("viewer.retry")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="mv-bottom" ref={bottomRef} data-hidden={chromeHidden || undefined}>
        {captionText ? (
          <div className="mv-caption" dir="auto">
            <RichText text={captionText} entities={captionEntry?.message.entities} />
          </div>
        ) : null}
        {album ? (
          <div className="mv-album">
            {album.entries.map((entry, entryIndex) => {
              const siblingIndex = album.start + entryIndex;
              return (
                <button
                  type="button"
                  key={entry.message.id}
                  className="mv-album-thumb"
                  data-active={siblingIndex === index || undefined}
                  onClick={() => goTo(siblingIndex)}
                  aria-label={t("viewer.position", {
                    position: entryIndex + 1,
                    count: album.entries.length,
                  })}
                >
                  <AlbumThumb entry={entry} current={siblingIndex === index} />
                  {entry.kind === "video" || entry.kind === "animation" ? (
                    <span className="mv-album-play" aria-hidden="true">
                      <Icon name="play_arrow" size={12} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {item.kind === "video" && videoEl ? (
          <DesktopVideoControls
            video={videoEl}
            hidden={chromeHidden}
            fullscreenTarget={viewerFullscreenTarget}
            onPlayingChange={setVideoPlaying}
            onToast={onToast}
          />
        ) : null}
        <div className="mv-info">
          <div className="mv-info-copy">
            <div className="mv-info-title" dir="auto">
              {headerText}
            </div>
            <button
              type="button"
              className="mv-info-sub"
              onClick={() => onShowInChat?.(item.message)}
              disabled={!onShowInChat}
              title={onShowInChat ? t("viewer.showInChat") : undefined}
            >
              <span className="mv-info-author" dir="auto">
                {author?.name ?? ""}
              </span>
              <span className="mv-info-dot" aria-hidden="true">
                •
              </span>
              <span className="mv-info-date">{dateLine}</span>
            </button>
          </div>
          <div className="mv-info-actions">
            {onDownload ? (
              <button
                type="button"
                className="mv-info-btn"
                onClick={() => onDownload(item.message)}
                aria-label={t("viewer.download")}
                title={t("viewer.download")}
              >
                <Icon name="download" size={26} />
              </button>
            ) : null}
            <button
              type="button"
              className="mv-info-btn"
              onClick={() => {
                setRotation((value) => value - 90);
                resetZoom();
              }}
              aria-label={t("viewer.rotate")}
              title={t("viewer.rotate")}
            >
              <Icon name="rotate_left" size={26} />
            </button>
            {onForward || onDelete || onShowInChat || captionText || active ? (
              <Menu
                trigger={<Icon name="more_vert" size={26} />}
                triggerClassName="mv-info-btn mv-more-trigger"
                side="top"
                align="end"
              >
                {active ? (
                  <MenuItem onSelect={copyImage}>
                    <span className="mv-menu-row">
                      <Icon name="content_copy" size={17} />
                      {t("viewer.copyImage")}
                    </span>
                  </MenuItem>
                ) : null}
                {captionText ? (
                  <MenuItem onSelect={copyCaption}>
                    <span className="mv-menu-row">
                      <Icon name="content_copy" size={17} />
                      {t("viewer.copyText")}
                    </span>
                  </MenuItem>
                ) : null}
                {onShowInChat ? (
                  <MenuItem onSelect={() => onShowInChat(item.message)}>
                    <span className="mv-menu-row">
                      <Icon name="chat_bubble" size={17} />
                      {t("viewer.showInChat")}
                    </span>
                  </MenuItem>
                ) : null}
                {onForward && !item.message.noForwards ? (
                  <MenuItem onSelect={() => onForward(item.message)}>
                    <span className="mv-menu-row">
                      <Icon name="forward" size={17} />
                      {t("viewer.forward")}
                    </span>
                  </MenuItem>
                ) : null}
                {onDelete ? (
                  <MenuItem onSelect={() => onDelete(item.message)}>
                    <span className="mv-menu-row">
                      <Icon name="delete" size={17} />
                      {t("viewer.delete")}
                    </span>
                  </MenuItem>
                ) : null}
              </Menu>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );

  return createPortal(content, document.body);
}

function AlbumThumb({ entry, current }: { entry: ViewerItem; current: boolean }) {
  const src = entry.thumbUrl || entry.imageUrl;
  const ratio =
    entry.width && entry.height
      ? clamp(entry.width / entry.height, 0.6, 2.2)
      : current
        ? 1.5
        : 0.72;
  const height = current ? 56 : 40;
  const width = Math.round(height * ratio);
  return (
    <span className="mv-album-media" style={{ width, height }}>
      {src ? <img src={src} alt="" draggable={false} loading="lazy" /> : null}
    </span>
  );
}

/** Fits the media under the slim top gap and above the measured bottom chrome. */
function computeBox(
  item: ViewerItem | undefined,
  viewport: { width: number; height: number },
  bottomHeight: number,
  rotation: number,
  naturalSize: { width: number; height: number } | null,
): Box {
  const availableWidth = Math.max(160, viewport.width - SIDE_GAP * 2);
  const availableHeight = Math.max(
    120,
    viewport.height - VIEWER_TOP_GAP - bottomHeight - 8,
  );

  if (item?.kind === "video_note") {
    const size = Math.min(availableWidth, availableHeight, 560);
    return {
      left: (viewport.width - size) / 2,
      top: VIEWER_TOP_GAP + (availableHeight - size) / 2,
      width: size,
      height: size,
      radius: size / 2,
    };
  }

  let width = item?.width ?? naturalSize?.width ?? 0;
  let height = item?.height ?? naturalSize?.height ?? 0;
  if (!width || !height) {
    width = 4;
    height = 3;
  }
  if (item?.kind === "photo" && width > MAX_WIDTH_PHOTO) {
    height = Math.round((height * MAX_WIDTH_PHOTO) / width);
    width = MAX_WIDTH_PHOTO;
  }

  let ratio = width / height;
  if (rotation % 180 !== 0) {
    ratio = 1 / ratio;
  }
  let boxWidth = availableWidth;
  let boxHeight = boxWidth / ratio;
  if (boxHeight > availableHeight) {
    boxHeight = availableHeight;
    boxWidth = boxHeight * ratio;
  }
  return {
    left: (viewport.width - boxWidth) / 2,
    top: VIEWER_TOP_GAP + (availableHeight - boxHeight) / 2,
    width: boxWidth,
    height: boxHeight,
    radius: 0,
  };
}
