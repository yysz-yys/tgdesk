import { useEffect, useMemo, useRef, useState } from "react";
import { Browser } from "@wailsio/runtime";
import { useTranslation } from "react-i18next";
import type { Message } from "../../types";
import { Icon, IconButton } from "../../ui";
import { MediaThumb } from "./MediaThumb";

/** mm:ss for the duration pills and audio rows, like Telegram Web. */
export function formatMediaDuration(seconds?: number) {
  const value = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function InfoEmpty({ text }: { text: string }) {
  return <p className="f-info-empty">{text}</p>;
}

/** Telegram Web renders shared photos, videos and GIFs in a 3-column grid. */
export function MediaGrid({
  items,
  gifs,
  onOpenPhoto,
  onPlayVideo,
}: {
  items: Message[];
  gifs?: boolean;
  onOpenPhoto?: (message: Message) => void;
  onPlayVideo?: (message: Message) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="f-info-media-grid">
      {items.map((message) => {
        const media = message.media;
        const kind = media?.kind;
        const playable = kind === "video" || kind === "video_note" || kind === "animation";
        const open = () => {
          if (playable) {
            onPlayVideo?.(message);
          } else {
            onOpenPhoto?.(message);
          }
        };
        return (
          <span className="f-info-media-cell" key={message.id}>
            <button
              type="button"
              className="f-info-media-open"
              aria-label={t(
                playable
                  ? gifs
                    ? "rightPanel.openGif"
                    : "media.video"
                  : "chat.openPhoto",
              )}
              onClick={open}
            >
              <MediaThumb
                src={media?.thumbUrl || media?.photoUrl}
                alt={media?.name ?? ""}
                className="f-info-media-img"
              />
            </button>
            {playable ? (
              <span className="f-info-media-badge">
                {kind === "animation" ? (
                  <span className="f-info-media-gif">GIF</span>
                ) : (
                  <Icon name="play_arrow" size={14} filled />
                )}
              </span>
            ) : null}
            {kind === "video" || kind === "video_note" ? (
              media?.duration ? (
                <span className="f-info-media-duration">
                  {formatMediaDuration(media.duration)}
                </span>
              ) : null
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** Files tab: one row per document, Telegram Web's 48 px icon + name + meta. */
export function FileList({
  items,
  onDownload,
}: {
  items: Message[];
  onDownload?: (ids: number[]) => void;
}) {
  return (
    <div className="f-info-rows">
      {items.map((message) => {
        const media = message.media;
        const ext = (media?.ext || "FILE").slice(0, 5).toUpperCase();
        return (
          <button
            type="button"
            className="f-info-row f-info-file-row"
            key={message.id}
            onClick={() => onDownload?.([message.id])}
          >
            <span
              className="f-info-file-icon"
              style={{ background: media?.color || "#f0a04b" }}
              aria-hidden
            >
              {ext}
            </span>
            <span className="f-info-row-copy">
              <b>{media?.name || message.text || "File"}</b>
              <small>
                {media?.size ? `${media.size} · ` : ""}
                {message.date}
              </small>
            </span>
            <span className="f-info-row-action" aria-hidden>
              <Icon name="download" size={16} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface LinkRow {
  url: string;
  title: string;
  description?: string;
  thumb?: string;
  color: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/iu;
const DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/\S*)?/iu;

function trimURL(value: string) {
  return value.replace(/[),.;!?]+$/u, "");
}

function absoluteURL(value: string) {
  const url = trimURL(value.trim());
  if (/^https?:\/\//iu.test(url)) {
    return url;
  }
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  return `https://${url.replace(/^\/+/u, "")}`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./iu, "");
  } catch {
    return url;
  }
}

/** Extracts the first URL of a message, preferring the web-page preview. */
function linkRow(message: Message): LinkRow | null {
  const media = message.media;
  if (media?.kind === "webpage" && media.url) {
    const url = absoluteURL(media.url || media.title || "");
    return {
      url,
      title: media.title || media.siteName || hostOf(url),
      description: media.description,
      thumb: media.photoUrl || media.thumbUrl,
      color: media.color || "#4fae7f",
    };
  }
  const text = message.text ?? "";
  for (const entity of message.entities ?? []) {
    if (entity.type !== "link" && entity.type !== "url") {
      continue;
    }
    const segment = text.slice(
      Math.max(0, entity.offset),
      entity.offset + entity.length,
    );
    const raw = entity.type === "link" && entity.url ? entity.url : segment;
    if (!raw) {
      continue;
    }
    const url = absoluteURL(raw);
    return {
      url,
      title: hostOf(url),
      description: text.replace(/\s+/gu, " ").trim() || undefined,
      thumb: media?.thumbUrl,
      color: media?.color || "#4fae7f",
    };
  }
  const match = text.match(URL_PATTERN) ?? text.match(DOMAIN_PATTERN);
  if (match) {
    const url = absoluteURL(match[0]);
    return {
      url,
      title: hostOf(url),
      description: text.replace(/\s+/gu, " ").trim() || undefined,
      thumb: media?.thumbUrl,
      color: "#4fae7f",
    };
  }
  return null;
}

/** Links tab: preview tile, title, description and the URL itself. */
export function LinkList({
  items,
  onToast,
}: {
  items: Message[];
  onToast?: (message: string) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(
    () =>
      items
        .map((message) => ({ message, link: linkRow(message) }))
        .filter(
          (row): row is { message: Message; link: LinkRow } => row.link !== null,
        ),
    [items],
  );

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onToast?.(t("chatMenu.copied"));
    } catch {
      onToast?.(t("chat.clipboardError"));
    }
  };

  return (
    <div className="f-info-rows">
      {rows.map(({ message, link }) => (
        <div className="f-info-row f-info-link-row" key={message.id}>
          <button
            type="button"
            className="f-info-row-main"
            onClick={() => void Browser.OpenURL(link.url)}
          >
            {link.thumb ? (
              <MediaThumb
                src={link.thumb}
                alt=""
                className="f-info-link-thumb"
              />
            ) : (
              <span
                className="f-info-link-thumb f-info-link-thumb-fallback"
                style={{ background: link.color }}
                aria-hidden
              >
                {(link.title || hostOf(link.url)).slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="f-info-row-copy">
              <b>{link.title}</b>
              {link.description ? <small>{link.description}</small> : null}
              <small className="f-info-link-url">{link.url}</small>
            </span>
          </button>
          <IconButton
            label={t("chatMenu.copyLink")}
            icon="content_copy"
            size="1"
            onClick={() => void copy(link.url)}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Music and voice tabs share one player so only one track is ever audible,
 * matching Telegram Web's audio rows.
 */
export function AudioList({
  items,
  voice,
}: {
  items: Message[];
  voice?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeID, setActiveID] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const toggle = (message: Message) => {
    const audio = audioRef.current;
    const url = message.media?.streamUrl;
    if (!audio || !url) {
      return;
    }
    if (activeID === message.id) {
      if (audio.paused) {
        void audio.play();
      } else {
        audio.pause();
      }
      return;
    }
    setActiveID(message.id);
    setProgress(0);
    audio.src = url;
    void audio.play().catch(() => setPlaying(false));
  };

  return (
    <div className="f-info-rows">
      {items.map((message) => {
        const media = message.media;
        const active = activeID === message.id;
        const title = voice
          ? message.sender || media?.name || "Voice message"
          : media?.title || media?.name || "Audio";
        const meta = voice
          ? `${formatMediaDuration(media?.duration)}${message.date ? ` · ${message.date}` : ""}`
          : `${media?.performer || ""}${
              media?.duration ? `${media.performer ? " · " : ""}${formatMediaDuration(media.duration)}` : ""
            }`;
        return (
          <button
            type="button"
            className="f-info-row f-info-audio-row"
            data-playing={active || undefined}
            key={message.id}
            onClick={() => toggle(message)}
          >
            <span className="f-info-audio-play" aria-hidden>
              <Icon
                name={active && playing ? "pause" : "play_arrow"}
                size={20}
                filled
              />
            </span>
            <span className="f-info-row-copy">
              <b>{title}</b>
              <small>{meta}</small>
              {active ? (
                <span className="f-info-audio-progress">
                  <span style={{ width: `${Math.round(progress * 100)}%` }} />
                </span>
              ) : null}
            </span>
            <span className="f-info-row-action" aria-hidden>
              {media?.duration ? formatMediaDuration(media.duration) : ""}
            </span>
          </button>
        );
      })}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
        }}
      />
    </div>
  );
}
