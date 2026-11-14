import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../ui";
import "./desktop-video-controls.css";

export interface DesktopVideoControlsProps {
  video: HTMLVideoElement | null;
  /** The bottom chrome is faded out while the video plays and the mouse idles. */
  hidden?: boolean;
  /** Element to request fullscreen on (the viewer window root). */
  fullscreenTarget?: HTMLElement | null;
  onPlayingChange?: (playing: boolean) => void;
  onToast?: (message: string) => void;
}

const SPEEDS = [0.5, 1, 1.5, 2];
const RATE_MENU_IDLE_MS = 4000;

function clock(seconds: number) {
  const value = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = value % 60;
  const tail = `${String(minutes).padStart(hours > 0 ? 2 : 1, "0")}:${String(rest).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${tail}` : tail;
}

/**
 * Telegram Desktop's in-viewer video controls: a centred 480 px block with
 * volume, play/pause, speed/PiP/fullscreen and a seek row with times, drawn
 * over the media's bottom edge instead of inside the video.
 */
export function DesktopVideoControls({
  video,
  hidden = false,
  fullscreenTarget,
  onPlayingChange,
  onToast,
}: DesktopVideoControlsProps) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const menuTimerRef = useRef<number | undefined>(undefined);
  const [pipSupported] = useState(
    () => typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled),
  );

  const syncBuffered = useCallback(() => {
    if (!video) {
      return;
    }
    try {
      const ranges = video.buffered;
      setBuffered(ranges.length > 0 ? ranges.end(ranges.length - 1) : 0);
    } catch {
      setBuffered(0);
    }
  }, [video]);

  useEffect(() => {
    if (!video) {
      return;
    }
    setPlaying(!video.paused);
    setCurrent(video.currentTime);
    setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    setVolume(video.volume);
    setMuted(video.muted);
    setRate(video.playbackRate);
    syncBuffered();

    const onPlay = () => {
      setPlaying(true);
      onPlayingChange?.(true);
    };
    const onPause = () => {
      setPlaying(false);
      onPlayingChange?.(false);
    };
    const onTime = () => setCurrent(video.currentTime);
    const onDuration = () =>
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onRate = () => setRate(video.playbackRate);
    const onProgress = () => syncBuffered();
    const onFullscreen = () =>
      setFullscreen(document.fullscreenElement === document.documentElement);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeking", onTime);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("loadedmetadata", onDuration);
    video.addEventListener("volumechange", onVolume);
    video.addEventListener("ratechange", onRate);
    video.addEventListener("progress", onProgress);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeking", onTime);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("volumechange", onVolume);
      video.removeEventListener("ratechange", onRate);
      video.removeEventListener("progress", onProgress);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [onPlayingChange, syncBuffered, video]);

  useEffect(
    () => () => {
      if (menuTimerRef.current) {
        window.clearTimeout(menuTimerRef.current);
      }
    },
    [],
  );

  const togglePlay = useCallback(() => {
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [video]);

  const toggleMute = useCallback(() => {
    if (!video) {
      return;
    }
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.6;
    }
  }, [video]);

  const changeVolume = useCallback(
    (value: number) => {
      if (!video) {
        return;
      }
      video.volume = value;
      video.muted = value === 0;
    },
    [video],
  );

  const seekTo = useCallback(
    (value: number) => {
      if (!video || !Number.isFinite(value)) {
        return;
      }
      video.currentTime = Math.min(Math.max(0, value), video.duration || value);
      setCurrent(video.currentTime);
    },
    [video],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const target = fullscreenTarget ?? document.documentElement;
    void target.requestFullscreen?.().catch(() => {
      onToast?.(t("viewer.fullscreen"));
    });
  }, [fullscreenTarget, onToast, t]);

  const togglePip = useCallback(() => {
    if (!video) {
      return;
    }
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
      return;
    }
    void video.requestPictureInPicture().catch(() => undefined);
  }, [video]);

  const chooseRate = useCallback(
    (value: number) => {
      if (!video) {
        return;
      }
      video.playbackRate = value;
      setRate(value);
      setRateMenuOpen(false);
    },
    [video],
  );

  const seekMax = duration > 0 ? duration : 0;
  const remaining = useMemo(
    () => (duration > 0 ? `-${clock(Math.max(0, duration - current))}` : "-0:00"),
    [current, duration],
  );
  const bufferedPercent = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const playedPercent = seekMax > 0 ? Math.min(100, (current / seekMax) * 100) : 0;

  return (
    <div className="dvc" data-hidden={hidden || undefined}>
      <div className="dvc-top">
        <div className="dvc-volume">
          <button
            type="button"
            className="dvc-btn dvc-volume-btn"
            onClick={toggleMute}
            aria-label={muted || volume === 0 ? t("viewer.unmute") : t("viewer.mute")}
            title={muted || volume === 0 ? t("viewer.unmute") : t("viewer.mute")}
          >
            <Icon name={muted || volume === 0 ? "volume_off" : "volume_up"} size={22} />
          </button>
          <input
            className="dvc-volume-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            aria-label={t("viewer.volume")}
            onChange={(event) => changeVolume(Number(event.target.value))}
          />
        </div>

        <button
          type="button"
          className="dvc-btn dvc-play"
          onClick={togglePlay}
          aria-label={playing ? t("viewer.pause") : t("viewer.play")}
          title={playing ? t("viewer.pause") : t("viewer.play")}
        >
          <Icon name={playing ? "pause" : "play_arrow"} size={30} />
        </button>

        <div className="dvc-right">
          <button
            type="button"
            className="dvc-btn"
            data-active={rateMenuOpen || undefined}
            onClick={() => {
              setRateMenuOpen((open) => !open);
              if (menuTimerRef.current) {
                window.clearTimeout(menuTimerRef.current);
              }
              menuTimerRef.current = window.setTimeout(
                () => setRateMenuOpen(false),
                RATE_MENU_IDLE_MS,
              );
            }}
            aria-label={t("viewer.playbackRate")}
            title={t("viewer.playbackRate")}
          >
            <Icon name="settings" size={22} />
          </button>
          {pipSupported ? (
            <button
              type="button"
              className="dvc-btn"
              onClick={togglePip}
              aria-label={t("viewer.pip")}
              title={t("viewer.pip")}
            >
              <Icon name="pip" size={22} />
            </button>
          ) : null}
          <button
            type="button"
            className="dvc-btn"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? t("viewer.exitFullscreen") : t("viewer.fullscreen")}
            title={fullscreen ? t("viewer.exitFullscreen") : t("viewer.fullscreen")}
          >
            <Icon name={fullscreen ? "fullscreen_exit" : "fullscreen"} size={22} />
          </button>
        </div>
      </div>

      <div className="dvc-seek">
        <span className="dvc-time">{clock(current)}</span>
        <span className="dvc-seek-track">
          <span className="dvc-seek-buffer" style={{ width: `${bufferedPercent}%` }} />
          <span className="dvc-seek-played" style={{ width: `${playedPercent}%` }} />
          <input
            className="dvc-seek-range"
            type="range"
            min={0}
            max={seekMax || 0}
            step={0.1}
            value={Math.min(current, seekMax || 0)}
            aria-label={t("viewer.seek")}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
        </span>
        <span className="dvc-time dvc-time-right">{remaining}</span>
      </div>

      {rateMenuOpen ? (
        <div className="dvc-menu" role="menu">
          {SPEEDS.map((speed) => (
            <button
              type="button"
              key={speed}
              className="dvc-menu-item"
              data-active={Math.abs(rate - speed) < 0.01 || undefined}
              onClick={() => chooseRate(speed)}
              role="menuitem"
            >
              <span>{speed}X</span>
              <span className="dvc-menu-check">
                {Math.abs(rate - speed) < 0.01 ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
