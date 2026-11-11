import { useTranslation } from "react-i18next";
import {
  IconArrowForwardUp,
  IconCheck,
  IconChecks,
  IconDownload,
  IconFile,
  IconPlayerPlay,
  IconSelectAll,
} from "@tabler/icons-react";
import type { Message } from "../../types";
import { chatColor } from "../../data/telegram";
import { MediaThumb } from "./MediaThumb";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/ContextMenu";

interface MessageBubbleProps {
  message: Message;
  selected: boolean;
  showSender?: boolean;
  onToggleSelect: (id: number) => void;
  onDownloadMessage?: (id: number) => void;
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onToast: (message: string) => void;
}

export function MessageBubble({
  message,
  selected,
  showSender,
  onToggleSelect,
  onDownloadMessage,
  onLoadThumbnail,
  onToast,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const hasText = Boolean(message.text?.trim());
  const media = message.media;

  const copyText = async () => {
    if (!message.text) {
      onToast(t("chat.noText"));
      return;
    }
    try {
      await navigator.clipboard.writeText(message.text);
      onToast(t("chat.copied"));
    } catch {
      onToast(t("chat.clipboardError"));
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="message-row"
          data-out={message.out}
          data-selected={selected}
          data-tail={message.tail}
        >
          <span className="message-actions">
            <button
              type="button"
              className="select-bubble"
              aria-label={selected ? t("chat.deselectMessage") : t("chat.selectMessage")}
              onClick={() => onToggleSelect(message.id)}
            >
              {selected && <IconCheck size={12} stroke={3} />}
            </button>
          </span>

          <div className="message-bubble" data-tail={message.tail}>
            {message.forwarded ? (
              <span className="message-forwarded">
                <IconArrowForwardUp size={13} stroke={1.9} />
                {message.forwardedFrom
                  ? t("chat.forwardedFromName", { name: message.forwardedFrom })
                  : t("chat.forwarded")}
              </span>
            ) : null}
            {showSender && !message.out && message.sender ? (
              <span
                className="message-sender"
                style={{ color: chatColor(message.sender) }}
              >
                {message.sender}
              </span>
            ) : null}
            {media?.kind === "video" ? (
              <div className="video-card">
                <MediaThumb
                  chatID={message.chatId}
                  messageID={message.id}
                  alt={media.name}
                  onLoad={onLoadThumbnail}
                />
                <span className="video-play" aria-hidden="true">
                  <IconPlayerPlay size={24} />
                </span>
                <span className="video-meta">
                  {media.duration ? formatDuration(media.duration) : media.size}
                </span>
              </div>
            ) : media?.kind === "photo" ? (
              <div className="photo-card">
                <MediaThumb
                  chatID={message.chatId}
                  messageID={message.id}
                  alt={media.name || t("media.photo")}
                  onLoad={onLoadThumbnail}
                />
                <span className="photo-caption">
                  {media.name || t("media.photo")}
                </span>
              </div>
            ) : media ? (
              <div className="message-file">
                <span
                  className="file-icon"
                  style={{ background: media.color ?? "var(--tg-accent)" }}
                >
                  <IconFile size={21} />
                </span>
                <span className="file-copy">
                  <span className="file-name">{media.name}</span>
                  <span className="file-size">
                    {media.size}
                    {media.duration ? ` · ${formatDuration(media.duration)}` : ""}
                    {media.width && media.height
                      ? ` · ${media.width}×${media.height}`
                      : ""}
                    {media.ext ? ` · ${media.ext}` : ""}
                  </span>
                </span>
                <IconDownload size={18} className="text-[var(--tg-secondary)]" />
              </div>
            ) : null}

            {hasText && <span>{message.text}</span>}

            <span className="message-time">
              {message.time}
              {message.out &&
                (message.checks === "read" ? (
                  <IconChecks className="message-checks" size={15} stroke={2} />
                ) : (
                  <IconCheck className="message-checks" size={14} stroke={2} />
                ))}
            </span>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        {media && onDownloadMessage ? (
          <ContextMenuItem
            icon={<IconDownload size={16} />}
            onSelect={() => onDownloadMessage(message.id)}
          >
            {t("common.download")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          icon={<IconSelectAll size={16} />}
          onSelect={() => onToggleSelect(message.id)}
        >
          {selected ? t("chat.deselect") : t("chat.select")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void copyText()}>{t("chat.copyText")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, "0")}`;
}
