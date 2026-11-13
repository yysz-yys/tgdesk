import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Browser } from "@wailsio/runtime";
import { useTranslation } from "react-i18next";
import type { DownloadTask, Message, MessageMedia } from "../../types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Icon,
  IconButton,
} from "../../ui";
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

/** Actions the chat-info lists can trigger from rows and context menus. */
export interface SectionActions {
  onDownload?: (ids: number[]) => void;
  onDownloadInline?: (ids: number[]) => void;
  onOpenDownloaded?: (task: DownloadTask) => void;
  downloads?: Map<number, DownloadTask>;
  onForward?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onJumpToMessage?: (messageID: number) => void;
  onToast?: (message: string) => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (message: Message) => void;
}

const DOWNLOADABLE_KINDS = new Set([
  "photo",
  "video",
  "video_note",
  "animation",
  "file",
  "audio",
  "voice",
  "sticker",
]);

/** Same capability checks Telegram Web uses for its shared-media menu. */
function canDownloadMedia(media?: MessageMedia) {
  return Boolean(media && DOWNLOADABLE_KINDS.has(media.kind));
}

function canCopyMedia(media?: MessageMedia) {
  return Boolean(media?.kind === "photo" && (media.photoUrl || media.thumbUrl));
}

/**
 * tweb's canSaveMessageMedia: outgoing messages and protected chats hide the
 * save/copy actions; inside a no-forwards chat only plain files, music and
 * voice messages survive.
 */
function canSaveMessage(message: Message) {
  if (message.out) {
    return false;
  }
  if (message.noForwards) {
    const kind = message.media?.kind;
    return kind === "file" || kind === "audio" || kind === "voice";
  }
  return true;
}

async function copyImageToClipboard(
  url: string,
  t: (key: string) => string,
  onToast?: (message: string) => void,
  fallback?: string,
) {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      throw new Error("clipboard image unsupported");
    }
    const response = await fetch(url);
    const blob = await response.blob();
    let png = blob;
    if (blob.type !== "image/png") {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const converted = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (converted) {
        png = converted;
      }
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    onToast?.(t("rightPanel.copiedMedia"));
  } catch {
    if (fallback) {
      try {
        await navigator.clipboard.writeText(fallback);
        onToast?.(t("chatMenu.copied"));
        return;
      } catch {
        // fall through to the error toast
      }
    }
    onToast?.(t("rightPanel.copyMediaFailed"));
  }
}

/**
 * The shared-media item menu, matching Telegram Web's order and conditions:
 * Forward, Copy Media (images only), Download, Show in chat, Select/Clear
 * selection, Delete. Links therefore get four items, photos all six, and
 * video/music/voice/GIF five.
 */
function InfoContextMenu({
  message,
  actions,
}: {
  message: Message;
  actions: SectionActions;
}) {
  const { t } = useTranslation();
  const media = message.media;
  const selected = Boolean(actions.selectedIds?.has(message.id));
  const items: ReactNode[] = [];

  if (actions.onForward) {
    items.push(
      <ContextMenuItem
        key="forward"
        icon={<Icon name="forward" size={18} />}
        onSelect={() => actions.onForward?.(message)}
      >
        {t("chat.forward")}
      </ContextMenuItem>,
    );
  }
  if (canCopyMedia(media) && canSaveMessage(message)) {
    items.push(
      <ContextMenuItem
        key="copy"
        icon={<Icon name="content_copy" size={18} />}
        onSelect={() =>
          void copyImageToClipboard(
            media?.photoUrl || media?.thumbUrl || "",
            t,
            actions.onToast,
          )
        }
      >
        {t("rightPanel.copyMedia")}
      </ContextMenuItem>,
    );
  }
  if (canDownloadMedia(media) && canSaveMessage(message) && actions.onDownload) {
    items.push(
      <ContextMenuItem
        key="download"
        icon={<Icon name="download" size={18} />}
        onSelect={() => actions.onDownload?.([message.id])}
      >
        {t("common.download")}
      </ContextMenuItem>,
    );
  }
  if (actions.onJumpToMessage) {
    items.push(
      <ContextMenuItem
        key="goto"
        icon={<Icon name="chat_bubble" size={18} />}
        onSelect={() => actions.onJumpToMessage?.(message.id)}
      >
        {t("rightPanel.showInChat")}
      </ContextMenuItem>,
    );
  }
  if (actions.onToggleSelect) {
    items.push(
      <ContextMenuItem
        key="select"
        icon={<Icon name="select_all" size={18} />}
        onSelect={() => actions.onToggleSelect?.(message)}
      >
        {selected ? t("rightPanel.clearSelection") : t("rightPanel.select")}
      </ContextMenuItem>,
    );
  }
  if (actions.onDelete) {
    items.push(
      <ContextMenuItem
        key="delete"
        icon={<Icon name="delete" size={18} />}
        danger
        onSelect={() => actions.onDelete?.(message)}
      >
        {t("chat.delete")}
      </ContextMenuItem>,
    );
  }

  if (items.length === 0) {
    return null;
  }
  return <ContextMenuContent>{items}</ContextMenuContent>;
}

function withContextMenu(
  message: Message,
  actions: SectionActions,
  element: ReactNode,
  key?: string | number,
) {
  return (
    <ContextMenu key={key}>
      <ContextMenuTrigger asChild>{element}</ContextMenuTrigger>
      <InfoContextMenu message={message} actions={actions} />
    </ContextMenu>
  );
}

function selectionActive(actions: SectionActions) {
  return Boolean(actions.selectedIds && actions.selectedIds.size > 0);
}

/**
 * Inline download affordance used by every shared-media list: a transparent
 * round button that becomes a progress ring while the transfer runs and a
 * check once it has been delivered. It never navigates away from the panel.
 */
function DownloadBadge({
  message,
  task,
  onStart,
  onOpen,
  variant,
}: {
  message: Message;
  task?: DownloadTask;
  onStart?: (ids: number[]) => void;
  onOpen?: (task: DownloadTask) => void;
  variant: "corner" | "file" | "row";
}) {
  const { t } = useTranslation();
  const status = task?.status;
  const done = status === "done";
  const progress = Math.max(0, Math.min(100, task?.progress ?? 0));
  const active = Boolean(task && !done);
  const label = done
    ? t("downloads.downloaded")
    : status === "paused"
      ? t("downloads.paused", { progress })
      : status === "failed"
        ? t("downloads.retry")
        : active
          ? t("downloads.progressLabel", { progress })
          : t("common.download");
  return (
    <button
      type="button"
      className="f-info-download"
      data-variant={variant}
      data-status={status ?? "idle"}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (done && task) {
          onOpen?.(task);
        } else if (!task || status === "failed") {
          onStart?.([message.id]);
        }
      }}
    >
      {active ? (
        <svg className="f-info-download-ring" viewBox="0 0 36 36" aria-hidden>
          <circle className="f-info-download-ring-track" cx="18" cy="18" r="16" />
          <circle
            className="f-info-download-ring-bar"
            cx="18"
            cy="18"
            r="16"
            pathLength={100}
            strokeDasharray={`${progress} 100`}
            transform="rotate(-90 18 18)"
          />
        </svg>
      ) : null}
      <Icon
        name={
          done
            ? "check"
            : status === "failed"
              ? "refresh"
              : status === "paused"
                ? "pause"
                : status === "active" || status === "queued"
                  ? "download"
                  : "download"
        }
        size={variant === "file" ? 14 : 15}
      />
    </button>
  );
}

/** Telegram Web renders shared photos, videos and GIFs in a 3-column grid. */
export function MediaGrid({
  items,
  gifs,
  onOpenPhoto,
  onPlayVideo,
  onDownload,
  onDownloadInline,
  onOpenDownloaded,
  downloads,
  onForward,
  onDelete,
  onJumpToMessage,
  onToast,
  selectedIds,
  onToggleSelect,
}: {
  items: Message[];
  gifs?: boolean;
  onOpenPhoto?: (message: Message) => void;
  onPlayVideo?: (message: Message) => void;
} & SectionActions) {
  const { t } = useTranslation();
  const actions: SectionActions = {
    onDownload,
    onForward,
    onDelete,
    onJumpToMessage,
    onToast,
    selectedIds,
    onToggleSelect,
  };
  const selecting = selectionActive(actions);
  return (
    <div className="f-info-media-grid" data-selecting={selecting || undefined}>
      {items.map((message) => {
        const media = message.media;
        const kind = media?.kind;
        const playable =
          kind === "video" || kind === "video_note" || kind === "animation";
        const selected = Boolean(selectedIds?.has(message.id));
        const open = () => {
          if (selecting) {
            onToggleSelect?.(message);
            return;
          }
          if (playable) {
            onPlayVideo?.(message);
          } else {
            onOpenPhoto?.(message);
          }
        };
        return withContextMenu(
          message,
          actions,
          <span
            className="f-info-media-cell"
            data-selected={selected || undefined}
          >
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
            {!selecting ? (
              <DownloadBadge
                variant="corner"
                message={message}
                task={downloads?.get(message.id)}
                onStart={onDownloadInline}
                onOpen={onOpenDownloaded}
              />
            ) : null}
            {selecting ? (
              <span className="f-info-select-check" aria-hidden>
                {selected ? <Icon name="check" size={14} /> : null}
              </span>
            ) : null}
          </span>,
          message.id,
        );
      })}
    </div>
  );
}

/** Files tab: one row per document, Telegram Web's 48 px icon + name + meta. */
export function FileList({
  items,
  onDownload,
  onDownloadInline,
  onOpenDownloaded,
  downloads,
  onForward,
  onDelete,
  onJumpToMessage,
  onToast,
  selectedIds,
  onToggleSelect,
}: {
  items: Message[];
} & SectionActions) {
  const actions: SectionActions = {
    onDownload,
    onForward,
    onDelete,
    onJumpToMessage,
    onToast,
    selectedIds,
    onToggleSelect,
  };
  const selecting = selectionActive(actions);
  return (
    <div className="f-info-rows" data-selecting={selecting || undefined}>
      {items.map((message) => {
        const media = message.media;
        const ext = (media?.ext || "FILE").slice(0, 5).toUpperCase();
        const task = downloads?.get(message.id);
        return withContextMenu(
          message,
          actions,
          <button
            type="button"
            className="f-info-row f-info-file-row"
            data-selected={selectedIds?.has(message.id) || undefined}
            onClick={() => {
              if (selecting) {
                onToggleSelect?.(message);
              } else {
                onDownloadInline?.([message.id]);
              }
            }}
          >
            <span className="f-info-file-icon-wrap">
              <span
                className="f-info-file-icon"
                style={{ background: media?.color || "#f0a04b" }}
                aria-hidden
              >
                {ext}
              </span>
              {!selecting ? (
                <DownloadBadge
                  variant="file"
                  message={message}
                  task={task}
                  onStart={onDownloadInline}
                  onOpen={onOpenDownloaded}
                />
              ) : null}
            </span>
            <span className="f-info-row-copy">
              <b>{media?.name || message.text || "File"}</b>
              <small>
                {media?.size ? `${media.size} · ` : ""}
                {message.date}
              </small>
            </span>
            {selecting ? (
              <span className="f-info-select-check" aria-hidden>
                {selectedIds?.has(message.id) ? (
                  <Icon name="check" size={14} />
                ) : null}
              </span>
            ) : task && task.status !== "done" ? (
              <span className="f-info-row-progress" aria-hidden>
                {task.progress}%
              </span>
            ) : (
              <span className="f-info-row-action" aria-hidden>
                {task?.status === "done" ? (
                  <Icon name="check" size={16} />
                ) : null}
              </span>
            )}
          </button>,
          message.id,
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
    const url = absoluteURL(media.url || "");
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
  onDownload,
  onForward,
  onDelete,
  onJumpToMessage,
  onToast,
  selectedIds,
  onToggleSelect,
}: {
  items: Message[];
} & SectionActions) {
  const { t } = useTranslation();
  const actions: SectionActions = {
    onDownload,
    onForward,
    onDelete,
    onJumpToMessage,
    onToast,
    selectedIds,
    onToggleSelect,
  };
  const selecting = selectionActive(actions);
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
    <div className="f-info-rows" data-selecting={selecting || undefined}>
      {rows.map(({ message, link }) =>
        withContextMenu(
          message,
          actions,
          <div
            className="f-info-row f-info-link-row"
            data-selected={selectedIds?.has(message.id) || undefined}
          >
            <button
              type="button"
              className="f-info-row-main"
              onClick={() => {
                if (selecting) {
                  onToggleSelect?.(message);
                } else {
                  void Browser.OpenURL(link.url);
                }
              }}
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
            {selecting ? (
              <span className="f-info-select-check" aria-hidden>
                {selectedIds?.has(message.id) ? (
                  <Icon name="check" size={14} />
                ) : null}
              </span>
            ) : (
              <IconButton
                label={t("chatMenu.copyLink")}
                icon="content_copy"
                size="1"
                onClick={() => void copy(link.url)}
              />
            )}
          </div>,
          message.id,
        ),
      )}
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
  onDownload,
  onDownloadInline,
  onOpenDownloaded,
  downloads,
  onForward,
  onDelete,
  onJumpToMessage,
  onToast,
  selectedIds,
  onToggleSelect,
}: {
  items: Message[];
  voice?: boolean;
} & SectionActions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeID, setActiveID] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const actions: SectionActions = {
    onDownload,
    onForward,
    onDelete,
    onJumpToMessage,
    onToast,
    selectedIds,
    onToggleSelect,
  };
  const selecting = selectionActive(actions);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const toggle = (message: Message) => {
    if (selecting) {
      onToggleSelect?.(message);
      return;
    }
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
    <div className="f-info-rows" data-selecting={selecting || undefined}>
      {items.map((message) => {
        const media = message.media;
        const active = activeID === message.id;
        const title = voice
          ? message.sender || media?.name || "Voice message"
          : media?.title || media?.name || "Audio";
        const meta = voice
          ? `${formatMediaDuration(media?.duration)}${message.date ? ` · ${message.date}` : ""}`
          : `${media?.performer || ""}${
              media?.duration
                ? `${media.performer ? " · " : ""}${formatMediaDuration(media.duration)}`
                : ""
            }`;
        return withContextMenu(
          message,
          actions,
          <button
            type="button"
            className="f-info-row f-info-audio-row"
            data-playing={active || undefined}
            data-selected={selectedIds?.has(message.id) || undefined}
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
            {selecting ? (
              <span className="f-info-select-check" aria-hidden>
                {selectedIds?.has(message.id) ? (
                  <Icon name="check" size={14} />
                ) : null}
              </span>
            ) : (
              <span className="f-info-row-action f-info-audio-actions">
                <span>{media?.duration ? formatMediaDuration(media.duration) : ""}</span>
                <DownloadBadge
                  variant="row"
                  message={message}
                  task={downloads?.get(message.id)}
                  onStart={onDownloadInline}
                  onOpen={onOpenDownloaded}
                />
              </span>
            )}
          </button>,
          message.id,
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
