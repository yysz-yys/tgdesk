import { useTranslation } from "react-i18next";
import { Browser } from "@wailsio/runtime";
import type { Message } from "../../types";
import { Icon } from "../ui/Icon";
import { PeerAvatar } from "./PeerAvatar";
import type { ChatAvatarLoader } from "./ChatAvatar";
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
  replyTo?: Message;
  selected: boolean;
  showSender?: boolean;
  showAvatar?: boolean;
  grouped?: boolean;
  lastInGroup?: boolean;
  onLoadAvatar: ChatAvatarLoader;
  onPlayVideo?: (message: Message) => void;
  onToggleSelect: (id: number) => void;
  onDownloadMessage?: (id: number) => void;
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onToast: (message: string) => void;
}

export function MessageBubble({
  message,
  author,
  replyTo,
  selected,
  showSender,
  showAvatar = false,
  grouped = false,
  lastInGroup = true,
  onLoadAvatar,
  onPlayVideo,
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
          data-avatars={showAvatar || undefined}
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

          {showAvatar ? (
            <PeerAvatar
              className="g-message-avatar"
              peerID={message.senderId}
              title={author.name}
              initials={author.initials}
              color={author.color}
              size={32}
              loader={onLoadAvatar}
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

              {message.replyToId ? (
                <div className="g-reply-quote">
                  <span className="g-reply-bar" aria-hidden="true" />
                  <span className="g-reply-copy">
                    <span className="g-reply-author">
                      {replyTo
                        ? replyTo.out
                          ? t("chat.you")
                          : replyTo.sender || t("chat.sender")
                        : t("chat.replyToMessage")}
                    </span>
                    <span className="g-reply-text">
                      {message.replyToText ||
                        replyTo?.text ||
                        replyTo?.media?.name ||
                        t("chat.replyToMessage")}
                    </span>
                  </span>
                </div>
              ) : null}

              {media?.kind === "poll" ? (
                <div className="g-poll">
                  <div className="g-poll-question">
                    {media.name}
                    {media.quiz ? (
                      <span className="g-poll-quiz">{t("media.quiz")}</span>
                    ) : null}
                  </div>
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
                      {media.live ? t("media.liveLocation") : t("media.location")}
                    </span>
                    <span className="g-location-coords">
                      {media.latitude?.toFixed(4)}, {media.longitude?.toFixed(4)}
                    </span>
                  </span>
                </button>
              ) : media?.kind === "venue" ? (
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
                      <Icon name="place" size={15} />
                      {media.title || media.name || t("media.location")}
                    </span>
                    <span className="g-location-coords">
                      {media.description || t("media.venue")}
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
              ) : media?.kind === "sticker" ? (
                <div className="g-sticker-card">
                  <MediaThumb
                    chatID={message.chatId}
                    messageID={message.id}
                    alt={media.name}
                    onLoad={onLoadThumbnail}
                  />
                  {media.emoji ? (
                    <span className="g-sticker-emoji">{media.emoji}</span>
                  ) : null}
                </div>
              ) : media?.kind === "animation" ? (
                <div className="g-video-card g-animation-card">
                  <MediaThumb
                    chatID={message.chatId}
                    messageID={message.id}
                    alt={media.name}
                    onLoad={onLoadThumbnail}
                  />
                  <span className="g-animation-badge">GIF</span>
                  <span className="g-video-meta">{media.size}</span>
                </div>
              ) : media?.kind === "webpage" ? (
                <button
                  type="button"
                  className="g-webpage-card"
                  onClick={() => {
                    if (media.url) {
                      void Browser.OpenURL(media.url);
                    }
                  }}
                >
                  <span className="g-webpage-icon">
                    <Icon name="link" size={20} />
                  </span>
                  <span className="g-webpage-copy">
                    <span className="g-webpage-site">
                      {media.siteName || media.url || t("media.webpage")}
                    </span>
                    <span className="g-webpage-title">
                      {media.title || media.name || t("media.webpage")}
                    </span>
                    {media.description ? (
                      <span className="g-webpage-description">{media.description}</span>
                    ) : null}
                  </span>
                  <Icon name="open_in_new" size={16} className="g-webpage-open" />
                </button>
              ) : media?.kind === "dice" ? (
                <div className="g-dice-card">
                  <span className="g-dice-emoji">{media.emoji || "🎲"}</span>
                  <span className="g-dice-value">{media.value || "—"}</span>
                </div>
              ) : media?.kind === "video" || media?.kind === "video_note" ? (
                <button
                  type="button"
                  className="g-video-card g-video-card--playable"
                  aria-label={t("chat.playVideo")}
                  onClick={() => onPlayVideo?.(message)}
                >
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
                </button>
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
                          : media.kind === "voice"
                            ? "mic"
                            : media.kind === "game"
                              ? "sports_esports"
                                : media.kind === "invoice"
                                  ? "receipt_long"
                                  : media.kind === "story"
                                    ? "auto_awesome"
                                    : media.kind === "giveaway"
                                      ? "redeem"
                                      : media.kind === "paid"
                                        ? "paid"
                                        : media.kind === "checklist"
                                          ? "checklist"
                                          : media.kind === "unsupported"
                                            ? "help"
                                            : "description"
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
