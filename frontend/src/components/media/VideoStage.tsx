import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../ui";
import "./video-stage.css";

export interface VideoStageProps {
  /** Loopback streaming URL served by the backend (Range capable). */
  src: string;
  /** Thumbnail URL shown under the video until the first frame is painted. */
  poster?: string;
  /** Natural media width from Telegram metadata (the parent sizes the box). */
  width?: number;
  /** Natural media height from Telegram metadata. */
  height?: number;
  /** Metadata duration fallback, used before the video reports its own. */
  duration?: number;
  autoPlay?: boolean;
  loop?: boolean;
  /** GIF / animation: muted, looping, autoplay, no player chrome. */
  isAnimation?: boolean;
  muted?: boolean;
  /** Round video message: video only, no controls, no centre button, no menus. */
  chromeless?: boolean;
  /** Element to fullscreen (the viewer root); the stage itself when omitted. */
  fullscreenTarget?: HTMLElement | null;
  /** Optional error toast; the message is already localized by the caller. */
  onToast?: (message: string) => void;
  /** Reports the live `<video>` element (or null on unmount) to the viewer. */
  onVideoElement?: (element: HTMLVideoElement | null) => void;
}

const PLAYBACK_RATES = [0.5, 1, 1.5, 2, 3];
const CONTROLS_HIDE_DELAY = 3000;
const VOLUME_STEP = 0.05;

/**
 * Telegram keeps volume/mute/playback-rate for the whole session, across every
 * player instance and both video and audio. Mirror that with module state, so a
 * re-opened viewer starts where the previous one left off.
 */
const playbackMemory = {
  volume: 1,
  muted: false,
  rate: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** `M:SS`, or `H:MM:SS` when the media is long enough (tweb `toHHMMSS`). */
function formatTime(value: number): string {
  const total = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const secondText = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondText}`;
  }
  return `${minutes}:${secondText}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function StageButton({
  label,
  icon,
  onClick,
  active,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className="tg-video-stage__btn"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={24} />
    </button>
  );
}

/**
 * In-viewer video surface: poster, streaming `<video>`, tweb-style controls
 * (progress line with buffered fill, hover time bubble, volume, speed menu,
 * PiP, fullscreen) plus loading and error states.
 *
 * The component fills the box its parent sizes to the exact media rectangle and
 * must be treated as an interactive island: pointer/click events are contained
 * so the surrounding viewer does not page, zoom or close on video input.
 */
export function VideoStage({
  src,
  poster,
  duration: durationProp,
  autoPlay = false,
  loop = false,
  isAnimation = false,
  muted: mutedProp = false,
  chromeless = false,
  fullscreenTarget,
  onToast,
  onVideoElement,
}: VideoStageProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onVideoElementRef = useRef(onVideoElement);
  onVideoElementRef.current = onVideoElement;
  useEffect(() => {
    onVideoElementRef.current?.(videoRef.current);
    return () => onVideoElementRef.current?.(null);
  }, []);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const rateMenuRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekActiveRef = useRef(false);
  const seekResumeRef = useRef(false);
  const volumeDraggingRef = useRef(false);
  const rateMenuOpenRef = useRef(false);
  const lastAudibleVolumeRef = useRef(
    playbackMemory.volume > 0 ? playbackMemory.volume : 1,
  );

  const stripChrome = isAnimation || chromeless;

  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => {
    const fallback = durationProp ?? 0;
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  });
  const [bufferedRatio, setBufferedRatio] = useState(0);
  const [muted, setMuted] = useState(
    () => Boolean(mutedProp) || isAnimation || playbackMemory.muted,
  );
  const [volume, setVolume] = useState(() =>
    isAnimation ? 0 : clamp(playbackMemory.volume, 0, 1),
  );
  const [rate, setRate] = useState(() =>
    isAnimation ? 1 : clamp(playbackMemory.rate, 0.5, 5),
  );
  const [controlsVisible, setControlsVisible] = useState(true);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [pipSupported] = useState(
    () => typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled),
  );
  const [retryToken, setRetryToken] = useState(0);

  const durationSafe = duration > 0 ? duration : 0;
  const progress = durationSafe > 0 ? clamp(currentTime / durationSafe, 0, 1) : 0;
  const effectiveMuted = muted || volume <= 0;
  const controlsShown =
    !stripChrome && (controlsVisible || !playing || seeking || rateMenuOpen);
  const rateLabel = String(rate);

  /* ---------------------------------------------------------------- */
  /* chrome auto-hide                                                  */
  /* ---------------------------------------------------------------- */

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    const video = videoRef.current;
    if (
      !video ||
      video.paused ||
      video.ended ||
      rateMenuOpenRef.current ||
      seekActiveRef.current
    ) {
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setControlsVisible(false);
    }, CONTROLS_HIDE_DELAY);
  }, [clearHideTimer]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(
    () => () => {
      clearHideTimer();
    },
    [clearHideTimer],
  );

  useEffect(() => {
    rateMenuOpenRef.current = rateMenuOpen;
    if (rateMenuOpen) {
      clearHideTimer();
      setControlsVisible(true);
      return;
    }
    scheduleHide();
  }, [rateMenuOpen, clearHideTimer, scheduleHide]);

  useEffect(() => {
    if (!rateMenuOpen) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const menu = rateMenuRef.current;
      if (event.target instanceof Node && menu?.contains(event.target)) {
        return;
      }
      setRateMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [rateMenuOpen]);

  /* ---------------------------------------------------------------- */
  /* playback state                                                    */
  /* ---------------------------------------------------------------- */

  const attemptPlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    try {
      await video.play();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "AbortError" || isAnimation) {
        return;
      }
      if (name !== "NotAllowedError") {
        // A source/decoder error is reported through the "error" event instead.
        return;
      }
      // Autoplay with sound was refused: retry muted, like tweb's
      // playOrPlayMuted(). The persisted session mute state is left untouched.
      try {
        video.muted = true;
        setMuted(true);
        await video.play();
      } catch {
        // Still refused — keep the paused UI (centre play button) visible.
      }
    }
  }, [isAnimation]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused || video.ended) {
      if (video.ended) {
        video.currentTime = 0;
        setCurrentTime(0);
      }
      void attemptPlay();
    } else {
      video.pause();
    }
  }, [attemptPlay]);

  const applyVolume = useCallback((value: number) => {
    const next = clamp(value, 0, 1);
    setVolume(next);
    playbackMemory.volume = next;
    if (next > 0) {
      lastAudibleVolumeRef.current = next;
    }
    setMuted(false);
    playbackMemory.muted = false;
  }, []);

  const nudgeVolume = useCallback((delta: number) => {
    setVolume((current) => {
      const next = clamp(current + delta, 0, 1);
      playbackMemory.volume = next;
      if (next > 0) {
        lastAudibleVolumeRef.current = next;
      }
      return next;
    });
    setMuted(false);
    playbackMemory.muted = false;
  }, []);

  const toggleMute = useCallback(() => {
    if (muted || volume <= 0) {
      const restore = volume > 0 ? volume : lastAudibleVolumeRef.current || 1;
      setVolume(restore);
      playbackMemory.volume = restore;
      setMuted(false);
      playbackMemory.muted = false;
    } else {
      setMuted(true);
      playbackMemory.muted = true;
    }
  }, [muted, volume]);

  const chooseRate = useCallback((value: number) => {
    setRate(value);
    playbackMemory.rate = value;
    setRateMenuOpen(false);
    const video = videoRef.current;
    if (video) {
      video.playbackRate = value;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (stripChrome) {
      return;
    }
    const target = fullscreenTarget ?? rootRef.current;
    if (!target) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void target.requestFullscreen().catch(() => undefined);
    }
  }, [fullscreenTarget, stripChrome]);

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video || !pipSupported || stripChrome) {
      return;
    }
    void (async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch {
        // PiP rejects without a gesture or before the first frame; ignore it.
      }
    })();
  }, [pipSupported, stripChrome]);

  /* ---------------------------------------------------------------- */
  /* effects: element sync                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.volume = clamp(volume, 0, 1);
    video.muted = muted || isAnimation;
  }, [volume, muted, isAnimation]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = rate;
    }
  }, [rate, src, retryToken]);

  useEffect(() => {
    const target = fullscreenTarget ?? rootRef.current;
    const update = () => {
      setFullscreen(Boolean(target && document.fullscreenElement === target));
    };
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [fullscreenTarget]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  // New source (or an explicit retry): reset the surface and autoplay.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      return;
    }
    setFailed(false);
    setPlaying(false);
    setCurrentTime(0);
    setBufferedRatio(0);
    setBuffering(true);
    setHoverRatio(null);
    if (!autoPlay && !isAnimation) {
      return;
    }
    void attemptPlay();
  }, [src, autoPlay, isAnimation, retryToken, attemptPlay]);

  // Smooth progress while playing (timeupdate only fires ~4 times a second).
  useEffect(() => {
    if (!playing) {
      return;
    }
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        setCurrentTime((previous) => {
          const next = video.currentTime;
          return Math.abs(next - previous) > 0.02 ? next : previous;
        });
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  /* ---------------------------------------------------------------- */
  /* keyboard (viewer keyboard owns arrows/escape/paging)              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (stripChrome) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        rateMenuOpenRef.current ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      switch (event.code) {
        case "Space":
          event.preventDefault();
          togglePlay();
          break;
        case "KeyM":
          event.preventDefault();
          toggleMute();
          break;
        case "KeyF":
          event.preventDefault();
          toggleFullscreen();
          break;
        case "ArrowUp":
          event.preventDefault();
          nudgeVolume(VOLUME_STEP);
          break;
        case "ArrowDown":
          event.preventDefault();
          nudgeVolume(-VOLUME_STEP);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stripChrome, togglePlay, toggleMute, toggleFullscreen, nudgeVolume]);

  /* ---------------------------------------------------------------- */
  /* media element handlers                                           */
  /* ---------------------------------------------------------------- */

  const syncBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const total =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : durationSafe;
    if (!total) {
      return;
    }
    try {
      const ranges = video.buffered;
      if (ranges.length === 0) {
        return;
      }
      setBufferedRatio(clamp(ranges.end(ranges.length - 1) / total, 0, 1));
    } catch {
      // A backend can throw while seeking; keep the last known buffered width.
    }
  }, [durationSafe]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const reported =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : durationProp ?? 0;
    setDuration(reported > 0 ? reported : 0);
    video.playbackRate = rate;
    video.volume = clamp(volume, 0, 1);
    video.muted = muted || isAnimation;
    syncBuffered();
  };

  const handleSurfaceClick = (event: ReactMouseEvent<HTMLVideoElement>) => {
    event.stopPropagation();
    togglePlay();
  };

  const handleSurfaceDoubleClick = (
    event: ReactMouseEvent<HTMLVideoElement>,
  ) => {
    event.stopPropagation();
    if (stripChrome) {
      return;
    }
    toggleFullscreen();
  };

  const handleVideoError = () => {
    if (!src) {
      return;
    }
    setFailed(true);
    setBuffering(false);
    setPlaying(false);
    onToast?.(t("viewer.videoError"));
  };

  const retry = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setFailed(false);
    setBuffering(true);
    video.src = src;
    video.load();
    setRetryToken((value) => value + 1);
  };

  /* ---------------------------------------------------------------- */
  /* seeking                                                           */
  /* ---------------------------------------------------------------- */

  const ratioAt = (clientX: number, element: HTMLElement | null): number => {
    if (!element) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) {
      return 0;
    }
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  const seekToRatio = (ratio: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const total =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : durationSafe;
    if (!total) {
      return;
    }
    // Clamp just short of the end so dragging does not fire "ended" (tweb does
    // the same and expects the user to press play/replay explicitly).
    const target = clamp(ratio * total, 0, Math.max(0, total - 0.1));
    video.currentTime = target;
    setCurrentTime(target);
  };

  const handleProgressPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (durationSafe <= 0) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekActiveRef.current = true;
    setSeeking(true);
    const video = videoRef.current;
    seekResumeRef.current = Boolean(video && !video.paused && !video.ended);
    video?.pause();
    clearHideTimer();
    setControlsVisible(true);
    const ratio = ratioAt(event.clientX, progressRef.current);
    seekToRatio(ratio);
    setHoverRatio(ratio);
  };

  const handleProgressPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (durationSafe <= 0) {
      return;
    }
    const ratio = ratioAt(event.clientX, progressRef.current);
    if (seekActiveRef.current) {
      seekToRatio(ratio);
    }
    setHoverRatio(ratio);
  };

  const endSeeking = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!seekActiveRef.current) {
      return;
    }
    seekActiveRef.current = false;
    setSeeking(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (seekResumeRef.current) {
      void attemptPlay();
    }
    seekResumeRef.current = false;
    setHoverRatio(null);
    scheduleHide();
  };

  const handleProgressKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    // Only while the seek bar itself is focused: the viewer owns arrow keys
    // everywhere else (paging).
    event.preventDefault();
    event.stopPropagation();
    const total =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : durationSafe;
    if (!total) {
      return;
    }
    const step = event.shiftKey ? 30 : 5;
    const next = clamp(
      video.currentTime + (event.key === "ArrowRight" ? step : -step),
      0,
      Math.max(0, total - 0.1),
    );
    video.currentTime = next;
    setCurrentTime(next);
  };

  /* ---------------------------------------------------------------- */
  /* volume slider                                                     */
  /* ---------------------------------------------------------------- */

  const handleVolumePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    volumeDraggingRef.current = true;
    applyVolume(ratioAt(event.clientX, volumeRef.current));
  };

  const handleVolumePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!volumeDraggingRef.current) {
      return;
    }
    applyVolume(ratioAt(event.clientX, volumeRef.current));
  };

  const endVolumeDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    volumeDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleVolumeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown"
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const down = event.key === "ArrowLeft" || event.key === "ArrowDown";
    nudgeVolume(down ? -VOLUME_STEP : VOLUME_STEP);
  };

  /* ---------------------------------------------------------------- */
  /* render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div
      ref={rootRef}
      className="tg-video-stage"
      data-animation={isAnimation || undefined}
      data-chromeless={stripChrome || undefined}
      data-playing={playing || undefined}
      data-show-controls={controlsShown || undefined}
      data-seeking={seeking || undefined}
      data-buffering={(buffering && !failed) || undefined}
      data-fullscreen={fullscreen || undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseMove={() => {
        if (!stripChrome) {
          showControls();
        }
      }}
      onMouseLeave={(event) => {
        if (stripChrome) {
          return;
        }
        // Leaving into the viewer's own chrome (top bar, caption) keeps the
        // controls visible, like tweb's showOnLeaveToClassName list.
        const viewerRoot = fullscreenTarget;
        if (
          viewerRoot &&
          event.relatedTarget instanceof Node &&
          viewerRoot.contains(event.relatedTarget)
        ) {
          clearHideTimer();
          setControlsVisible(true);
          return;
        }
        const video = videoRef.current;
        if (video && !video.paused && !video.ended && !rateMenuOpenRef.current) {
          clearHideTimer();
          setControlsVisible(false);
        }
      }}
    >
      {poster ? (
        <img
          className="tg-video-stage__poster"
          src={poster}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ) : null}

      <video
        ref={videoRef}
        className="tg-video-stage__video"
        src={src}
        poster={poster}
        playsInline
        controls={false}
        disablePictureInPicture={stripChrome}
        preload="auto"
        loop={loop || isAnimation}
        onClick={handleSurfaceClick}
        onDoubleClick={handleSurfaceDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => setBuffering(false)}
        onCanPlay={() => {
          setBuffering(false);
          syncBuffered();
        }}
        onSeeked={() => setBuffering(false)}
        onPlaying={() => {
          setBuffering(false);
          setPlaying(true);
        }}
        onPlay={() => {
          setPlaying(true);
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          clearHideTimer();
          setControlsVisible(true);
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          if (event.currentTarget.paused) {
            syncBuffered();
          }
        }}
        onProgress={() => syncBuffered()}
        onWaiting={() => setBuffering(true)}
        onEnded={() => {
          const video = videoRef.current;
          setPlaying(false);
          setBuffering(false);
          setCurrentTime(video?.duration ?? durationSafe);
          clearHideTimer();
          setControlsVisible(true);
        }}
        onError={handleVideoError}
      />

      {failed ? (
        <div
          className="tg-video-stage__status tg-video-stage__status--error"
          role="alert"
        >
          <Icon name="error" size={30} />
          <span className="tg-video-stage__status-text">
            {t("viewer.videoError")}
          </span>
          <button
            type="button"
            className="tg-video-stage__retry"
            onClick={retry}
          >
            {t("viewer.retry")}
          </button>
        </div>
      ) : null}

      {!failed && buffering ? (
        <span
          className="tg-video-stage__spinner"
          role="status"
          aria-label={t("viewer.videoLoading")}
        />
      ) : null}

      {!stripChrome && !failed && !playing && !buffering ? (
        <span className="tg-video-stage__center" aria-hidden="true">
          <Icon name="play_arrow" size={64} />
        </span>
      ) : null}

      {!stripChrome ? (
        <>
          <div className="tg-video-stage__scrim" aria-hidden="true" />
          <div className="tg-video-stage__controls" dir="ltr">
            <div
              ref={progressRef}
              className="tg-video-stage__progress"
              role="slider"
              tabIndex={0}
              aria-label={t("viewer.seek")}
              aria-valuemin={0}
              aria-valuemax={Math.round(durationSafe)}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${formatTime(currentTime)} / ${formatTime(
                durationSafe,
              )}`}
              aria-orientation="horizontal"
              data-dragging={seeking || undefined}
              onPointerDown={handleProgressPointerDown}
              onPointerMove={handleProgressPointerMove}
              onPointerUp={endSeeking}
              onPointerCancel={endSeeking}
              onPointerLeave={() => {
                if (!seekActiveRef.current) {
                  setHoverRatio(null);
                }
              }}
              onKeyDown={handleProgressKeyDown}
            >
              <span className="tg-video-stage__track" aria-hidden="true">
                <span
                  className="tg-video-stage__buffered"
                  style={{ width: `${bufferedRatio * 100}%` }}
                />
                <span
                  className="tg-video-stage__played"
                  style={{ width: `${progress * 100}%` }}
                />
              </span>
              <span
                className="tg-video-stage__thumb"
                style={{ left: `${progress * 100}%` }}
                aria-hidden="true"
              />
              {hoverRatio !== null ? (
                <span
                  className="tg-video-stage__bubble"
                  style={{
                    left: `clamp(20px, ${hoverRatio * 100}%, calc(100% - 20px))`,
                  }}
                  aria-hidden="true"
                >
                  {formatTime(hoverRatio * durationSafe)}
                </span>
              ) : null}
            </div>

            <div className="tg-video-stage__row">
              <div className="tg-video-stage__group">
                <button
                  type="button"
                  className="tg-video-stage__btn"
                  aria-label={playing ? t("viewer.pause") : t("viewer.play")}
                  title={playing ? t("viewer.pause") : t("viewer.play")}
                  onClick={togglePlay}
                >
                  <Icon name={playing ? "pause" : "play_arrow"} size={24} />
                </button>

                <div className="tg-video-stage__volume">
                  <button
                    type="button"
                    className="tg-video-stage__btn"
                    aria-label={
                      effectiveMuted ? t("viewer.unmute") : t("viewer.mute")
                    }
                    aria-pressed={effectiveMuted}
                    title={
                      effectiveMuted ? t("viewer.unmute") : t("viewer.mute")
                    }
                    onClick={toggleMute}
                  >
                    <Icon
                      name={effectiveMuted ? "volume_off" : "volume_up"}
                      size={24}
                    />
                  </button>
                  <div
                    ref={volumeRef}
                    className="tg-video-stage__volume-bar"
                    role="slider"
                    tabIndex={0}
                    aria-label={t("viewer.volume")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(volume * 100)}
                    aria-orientation="horizontal"
                    onPointerDown={handleVolumePointerDown}
                    onPointerMove={handleVolumePointerMove}
                    onPointerUp={endVolumeDrag}
                    onPointerCancel={endVolumeDrag}
                    onKeyDown={handleVolumeKeyDown}
                  >
                    <span
                      className="tg-video-stage__volume-fill"
                      style={{ width: `${clamp(volume, 0, 1) * 100}%` }}
                    />
                  </div>
                </div>

                <span className="tg-video-stage__time">
                  <time>{formatTime(currentTime)}</time>
                  <span aria-hidden="true">/</span>
                  <time>{formatTime(durationSafe)}</time>
                </span>
              </div>

              <div className="tg-video-stage__group">
                <div ref={rateMenuRef} className="tg-video-stage__rate">
                  <button
                    type="button"
                    className="tg-video-stage__btn tg-video-stage__btn--rate"
                    aria-label={t("viewer.playbackRate")}
                    title={t("viewer.playbackRate")}
                    aria-haspopup="menu"
                    aria-expanded={rateMenuOpen}
                    data-active={rateMenuOpen || undefined}
                    onClick={() => setRateMenuOpen((value) => !value)}
                  >
                    <span className="tg-video-stage__rate-label">
                      {t("viewer.rate", { rate: rateLabel })}
                    </span>
                  </button>
                  {rateMenuOpen ? (
                    <div className="tg-video-stage__rate-menu" role="menu">
                      {PLAYBACK_RATES.map((value) => (
                        <button
                          key={value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={rate === value}
                          className="tg-video-stage__rate-item"
                          data-active={rate === value || undefined}
                          onClick={() => chooseRate(value)}
                        >
                          <span className="tg-video-stage__rate-check">
                            {rate === value ? (
                              <Icon name="check" size={16} />
                            ) : null}
                          </span>
                          <span>{t("viewer.rate", { rate: String(value) })}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {pipSupported ? (
                  <StageButton
                    label={t("viewer.pip")}
                    icon="pip"
                    active={pipActive}
                    onClick={togglePip}
                  />
                ) : null}

                <StageButton
                  label={
                    fullscreen
                      ? t("viewer.exitFullscreen")
                      : t("viewer.fullscreen")
                  }
                  icon={fullscreen ? "fullscreen_exit" : "fullscreen"}
                  active={fullscreen}
                  onClick={toggleFullscreen}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
