import { useTranslation } from "react-i18next";
import { Browser } from "@wailsio/runtime";
import type { Message } from "../../types";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/ContextMenu";
import { MediaThumb } from "./MediaThumb";
import { LocationPreview } from "./LocationPreview";

export interface MessageAuthor {
  name: string;
  initials: string;
  color: string;
}

interface MessageBubbleProps {
  message: Message;
  author: MessageAuthor;
  selected: boolean;
  showSender?: boolean;
  grouped?: boolean;
  lastInGroup?: boolean;
  onToggleSelect: (id: number) => void;
  onDownloadMessage?: (id: number) => void;
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onToast: (message: string) => void;
}

export function MessageBubble({
  message,
  author,
  selected,
  showSender,
  grouped = false,
  lastInGroup = true,
  onToggleSelect,
  onDownloadMessage,
  onLoadThumbnail,
  onToast,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const hasText = Boolean(message.text?.trim());
  const media = message.media;

  const openLocation = () => {
    if (media?.latitude === undefined || media.longitude === undefined) {
      return;
    }
    void Browser.OpenURL(
      `https://www.openstreetmap.org/?mlat=${media.latitude}&mlon=${media.longitude}#map=15/${media.latitude}/${media.longitude}`,
    );
  };

  const copyPhone = async () => {
    if (!media?.phone) {
      return;
    }
    try {
      await navigator.clipboard.writeText(media.phone);
      onToast(t("chat.phoneCopied"));
    } catch {
      onToast(t("chat.clipboardError"));
    }
  };

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
          className="g-message-row"
          data-out={message.out || undefined}
          data-selected={selected || undefined}
          data-grouped={grouped || undefined}
          data-last={lastInGroup || undefined}
        >
          <button
            type="button"
            className="g-message-select"
            tabIndex={selected ? 0 : -1}
            aria-label={selected ? t("chat.deselectMessage") : t("chat.selectMessage")}
            onClick={() => onToggleSelect(message.id)}
          >
            {selected ? <Icon name="check" size={13} /> : null}
          </button>

          {!grouped ? (
            <Avatar
              className="g-message-avatar"
              title={author.name}
              initials={author.initials}
              color={author.color}
              size={32}
            />
          ) : null}

          <div className="g-message-stack">
            {showSender ? (
              <span className="g-message-author">{author.name}</span>
            ) : null}

            <div className="g-message-bubble">
              {message.forwarded ? (
                <span className="g-message-forwarded">
                  <Icon name="forward" size={14} />
                  {message.forwardedFrom
                    ? t("chat.forwardedFromName", { name: message.forwardedFrom })
                    : t("chat.forwarded")}
                </span>
              ) : null}

              {media?.kind === "poll" ? (
                <div className="g-poll">
                  <div className="g-poll-question">{media.name}</div>
                  <div className="g-poll-options">
                    {(media.options ?? []).map((option, index) => {
                      const voters = media.voteCounts?.[index] ?? 0;
                      const total = media.totalVoters ?? 0;
                      const percent = total > 0 ? Math.round((voters / total) * 100) : 0;
                      return (
                        <div
                          className="g-poll-option"
                          data-chosen={media.chosen?.[index] === true || undefined}
                          key={`${option}-${index}`}
                        >
                          <span className="g-poll-radio">
                            {media.chosen?.[index] ? <Icon name="check" size={12} /> : null}
                          </span>
                          <span className="g-poll-option-copy">
                            <span className="g-poll-option-text">{option}</span>
                            {total > 0 ? (
                              <span className="g-poll-option-percent">{percent}%</span>
                            ) : null}
                          </span>
                          {total > 0 ? (
                            <span className="g-poll-track" aria-hidden="true">
                              <span
                                className="g-poll-fill"
                                style={{ width: `${percent}%` }}
                              />
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="g-poll-footer">
                    {media.totalVoters
                      ? t("media.votes", { count: media.totalVoters })
                      : t("media.poll")}
                    {media.pollClosed ? ` · ${t("media.finalResults")}` : ""}
                  </div>
                </div>
              ) : media?.kind === "location" ? (
                <button
                  type="button"
                  className="g-location-card"
                  onClick={openLocation}
                  title={t("chat.openMap")}
                >
                  <LocationPreview
                    latitude={media.latitude ?? 0}
                    longitude={media.longitude ?? 0}
                  />
                  <span className="g-location-copy">
                    <span className="g-location-title">
                      <Icon name="location_on" size={15} />
                      {t("media.location")}
                    </span>
                    <span className="g-location-coords">
                      {media.latitude?.toFixed(4)}, {media.longitude?.toFixed(4)}
                    </span>
                  </span>
                </button>
              ) : media?.kind === "contact" ? (
                <button
                  type="button"
                  className="g-contact-card"
                  onClick={() => void copyPhone()}
                  title={t("chat.copyPhone")}
                >
                  <span className="g-contact-avatar">
                    {(media.contactName || media.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="g-contact-copy">
                    <span className="g-contact-name">
                      {media.contactName || media.name || t("media.contact")}
                    </span>
                    <span className="g-contact-phone">
                      <Icon name="call" size={13} />
                      {media.phone}
                    </span>
                  </span>
                </button>
              ) : media?.kind === "video" ? (
                <div className="g-video-card">
                  <MediaThumb
                    chatID={message.chatId}
                    messageID={message.id}
                    alt={media.name}
                    onLoad={onLoadThumbnail}
                  />
                  <span className="g-video-play" aria-hidden="true">
                    <Icon name="play_arrow" size={26} filled />
                  </span>
                  <span className="g-video-meta">
                    {media.duration ? formatDuration(media.duration) : media.size}
                  </span>
                </div>
              ) : media?.kind === "photo" ? (
                <div className="g-photo-card">
                  <MediaThumb
                    chatID={message.chatId}
                    messageID={message.id}
                    alt={media.name || t("media.photo")}
                    onLoad={onLoadThumbnail}
                  />
                  <span className="g-photo-caption">{media.name || t("media.photo")}</span>
                </div>
              ) : media ? (
                <div className="g-file-card">
                  <span
                    className="g-file-icon"
                    style={{ background: media.color ?? "var(--app-primary)" }}
                  >
                    <Icon
                      name={
                        media.kind === "audio"
                          ? "audio_file"
                          : media.kind === "file"
                            ? "description"
                            : "draft"
                      }
                      size={22}
                    />
                  </span>
                  <span className="g-file-copy">
                    <span className="g-file-name">{media.name}</span>
                    <span className="g-file-size">
                      {media.size}
                      {media.duration ? ` · ${formatDuration(media.duration)}` : ""}
                      {media.width && media.height ? ` · ${media.width}×${media.height}` : ""}
                      {media.ext ? ` · ${media.ext}` : ""}
                    </span>
                  </span>
                  <Icon name="download" size={19} className="g-file-download" />
                </div>
              ) : null}

              {hasText ? <span className="g-message-text">{message.text}</span> : null}

              <span className="g-message-meta">
                <span>{message.time}</span>
                {message.out ? (
                  message.checks === "read" ? (
                    <Icon name="done_all" size={14} className="g-message-checks" />
                  ) : (
                    <Icon name="done" size={14} className="g-message-checks" />
                  )
                ) : null}
              </span>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        {media && onDownloadMessage ? (
          <ContextMenuItem
            icon={<Icon name="download" size={18} />}
            onSelect={() => onDownloadMessage(message.id)}
          >
            {t("common.download")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          icon={<Icon name="select_all" size={18} />}
          onSelect={() => onToggleSelect(message.id)}
        >
          {selected ? t("chat.deselect") : t("chat.select")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Icon name="content_copy" size={18} />} onSelect={() => void copyText()}>
          {t("chat.copyText")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, "0")}`;
}
