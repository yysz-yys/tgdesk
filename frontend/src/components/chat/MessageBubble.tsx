import { useTranslation } from "react-i18next";
import {
  IconCheck,
  IconChecks,
  IconDownload,
  IconFile,
  IconPhoto,
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
                <span className="photo-placeholder" aria-hidden="true">
                  <IconPhoto size={26} stroke={1.6} />
                </span>
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
