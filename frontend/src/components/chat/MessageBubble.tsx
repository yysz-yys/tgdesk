import { useTranslation } from "react-i18next";
import {
  IconCheck,
  IconChecks,
  IconDownload,
  IconFile,
  IconSelectAll,
} from "@tabler/icons-react";
import type { Message } from "../../types";
import { chatColor } from "../../data/telegram";
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
  onToast: (message: string) => void;
}

export function MessageBubble({
  message,
  selected,
  showSender,
  onToggleSelect,
  onDownloadMessage,
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
            {showSender && !message.out && message.sender ? (
              <span
                className="message-sender"
                style={{ color: chatColor(message.sender) }}
              >
                {message.sender}
              </span>
            ) : null}
            {media?.kind === "photo" ? (
              <div className="photo-card">
                <svg
                  className="photo-art"
                  viewBox="0 0 320 190"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={`sky-${message.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#8eb9de" />
                      <stop offset="1" stopColor="#e9f2f8" />
                    </linearGradient>
                  </defs>
                  <rect width="320" height="190" fill={`url(#sky-${message.id})`} />
                  <circle cx="248" cy="46" r="17" fill="#f7e1a8" />
                  <path
                    d="M0 150 L62 92 L108 126 L164 72 L224 132 L278 92 L320 128 L320 190 L0 190Z"
                    fill="#6b8ba4"
                  />
                  <path
                    d="M0 164 L72 120 L128 154 L196 108 L258 150 L320 118 L320 190 L0 190Z"
                    fill="#36566d"
                  />
                </svg>
                <span className="photo-caption">{media.name}</span>
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
