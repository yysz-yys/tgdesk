import { Fragment, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Browser } from "@wailsio/runtime";
import type { DownloadTask, Message, Reaction } from "../../types";
import type { ViewerSource } from "../media/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Icon,
} from "../../ui";
import { PeerAvatar } from "./PeerAvatar";
import { MessageMediaView, isBleedMedia } from "./MessageMediaView";

export interface MessageAuthor {
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string;
}

interface MessageBubbleProps {
  message: Message;
  author: MessageAuthor;
  replyTo?: Message;
  album?: Message[];
  showSender?: boolean;
  showAvatar?: boolean;
  showAvatarSpace?: boolean;
  grouped?: boolean;
  lastInGroup?: boolean;
  onPlayVideo?: (message: Message, source?: ViewerSource) => void;
  onOpenPhoto?: (message: Message, source?: ViewerSource) => void;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onForward?: (message: Message, group?: Message[]) => void;
  onDelete?: (message: Message, revoke: boolean, group?: Message[]) => void;
  onJumpToMessage?: (id: number) => void;
  onDownloadMessage?: (ids: number[]) => void;
  downloads?: Map<number, DownloadTask>;
  onDownloadInline?: (ids: number[]) => void;
  onOpenDownloaded?: (task: DownloadTask) => void;
  onPauseDownload?: (task: DownloadTask) => void;
  onResumeDownload?: (task: DownloadTask) => void;
  onReact?: (message: Message, reaction: Reaction | null) => void;
  onOpenReactions?: (message: Message) => void;
  onToast: (message: string) => void;
}

interface MessageAction {
  key: string;
  label: string;
  icon: string;
  danger?: boolean;
  separatorBefore?: boolean;
  run: () => void;
}

export function MessageBubble({
  message,
  author,
  replyTo,
  album,
  showSender,
  showAvatar = false,
  showAvatarSpace = false,
  grouped = false,
  lastInGroup = true,
  onPlayVideo,
  onOpenPhoto,
  onReply,
  onEdit,
  onForward,
  onDelete,
  onJumpToMessage,
  onDownloadMessage,
  downloads,
  onDownloadInline,
  onOpenDownloaded,
  onPauseDownload,
  onResumeDownload,
  onReact,
  onOpenReactions,
  onToast,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const messageText =
    message.text?.trim()
      ? message.text
      : (album?.find((item) => item.text?.trim())?.text ?? "");
  const hasText = Boolean(messageText.trim());
  const hasReactions = Boolean(message.reactions?.length);
  const media = message.media;

  const copyText = async () => {
    if (!messageText) {
      onToast(t("chat.noText"));
      return;
    }
    try {
      await navigator.clipboard.writeText(messageText);
      onToast(t("chat.copied"));
    } catch {
      onToast(t("chat.clipboardError"));
    }
  };

  const jumpToReply = () => {
    if (message.replyToId) {
      onJumpToMessage?.(message.replyToId);
    }
  };

  const canEdit =
    !(album && album.length > 1) &&
    message.out &&
    hasText &&
    !media &&
    Boolean(onEdit);
  const actions: MessageAction[] = [];
  if (onOpenReactions) {
    actions.push({
      key: "react",
      label: t("chat.react"),
      icon: "mood",
      run: () => onOpenReactions(message),
    });
  }
  if (onReply) {
    actions.push({
      key: "reply",
      label: t("chat.reply"),
      icon: "reply",
      run: () => onReply(message),
    });
  }
  if (hasText) {
    actions.push({
      key: "copy",
      label: t("chat.copyText"),
      icon: "content_copy",
      run: () => void copyText(),
    });
  }
  if (onForward) {
    actions.push({
      key: "forward",
      label: t("chat.forward"),
      icon: "forward",
      run: () => onForward(message, album),
    });
  }
  if (canEdit && onEdit) {
    actions.push({
      key: "edit",
      label: t("chat.edit"),
      icon: "edit",
      run: () => onEdit(message),
    });
  }
  if (media && onDownloadMessage) {
    actions.push({
      key: "download",
      label: t("common.download"),
      icon: "download",
      separatorBefore: actions.length > 0,
      run: () => onDownloadMessage(album?.map((item) => item.id) ?? [message.id]),
    });
  }
  if (onDelete) {
    const deleteItems: MessageAction[] = [];
    if (message.out) {
      deleteItems.push({
        key: "delete-all",
        label: t("chat.deleteForEveryone"),
        icon: "delete_forever",
        danger: true,
        run: () => onDelete(message, true, album),
      });
    }
    deleteItems.push({
      key: "delete-me",
      label: message.out ? t("chat.deleteForMe") : t("chat.delete"),
      icon: "delete",
      danger: true,
      run: () => onDelete(message, false, album),
    });
    deleteItems.forEach((item, index) => {
      item.separatorBefore = index === 0;
      actions.push(item);
    });
  }

  const albumItems = album && album.length > 1 ? album : undefined;
  const bleed = Boolean(media && isBleedMedia(media));
  const sticker = media?.kind === "sticker";
  const mediaAfterText = media?.kind === "webpage";
  const bareMedia = Boolean(
    media &&
      !hasText &&
      !hasReactions &&
      !message.replyToId &&
      !message.forwarded &&
      !message.buttons?.length &&
      !message.postAuthor &&
      (media.kind === "photo" ||
        media.kind === "video" ||
        media.kind === "video_note" ||
        media.kind === "animation"),
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="g-message-row"
          data-out={message.out || undefined}
          data-grouped={grouped || undefined}
          data-last={lastInGroup || undefined}
          data-avatars={showAvatar || undefined}
          data-avatar-space={showAvatarSpace || undefined}
          data-bleed={bleed || undefined}
          data-sticker={sticker || undefined}
          data-bare-media={bareMedia || undefined}
        >
          {showAvatar && !message.out ? (
            <PeerAvatar
              className="g-message-avatar"
              peerID={message.senderId}
              title={author.name}
              initials={author.initials}
              color={author.color}
              photo={author.avatarUrl}
              size={32}
            />
          ) : null}

          <div className="g-message-stack">
            <div className="g-message-content">
            <div
              className="g-message-bubble"
              data-bleed={bleed || undefined}
              data-sticker={sticker || undefined}
              data-media={media ? true : undefined}
            >
              {showSender ? (
                <span
                  className="g-message-author"
                  style={{ "--peer-color": author.color } as CSSProperties}
                >
                  <span>{author.name}</span>
                  {message.senderEmojiStatusUrl ? (
                    <img
                      className="g-message-emoji-status"
                      src={message.senderEmojiStatusUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </span>
              ) : null}
              {message.forwarded ? (
                <span className="g-message-forwarded">
                  <Icon name="forward" size={14} />
                  {message.forwardedFrom
                    ? t("chat.forwardedFromName", { name: message.forwardedFrom })
                    : t("chat.forwarded")}
                </span>
              ) : null}

              {message.replyToId ? (
                <button
                  type="button"
                  className="g-reply-quote"
                  onClick={jumpToReply}
                  title={t("chat.jumpToReply")}
                >
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
                </button>
              ) : null}

              {!mediaAfterText && media ? (
                <MessageMediaView
                  message={message}
                  album={albumItems}
                  onOpenPhoto={onOpenPhoto}
                  onPlayVideo={onPlayVideo}
                  onToast={onToast}
                  downloads={downloads}
                  onDownloadInline={onDownloadInline}
                  onOpenDownloaded={onOpenDownloaded}
                  onPauseDownload={onPauseDownload}
                  onResumeDownload={onResumeDownload}
                />
              ) : null}

              {hasText ? (
                <div className="g-message-caption">
                  <RichText text={messageText} entities={message.entities} />
                  {!mediaAfterText && !hasReactions ? (
                    <MessageMeta message={message} />
                  ) : null}
                </div>
              ) : null}

              {mediaAfterText && media ? (
                <MessageMediaView
                  message={message}
                  album={albumItems}
                  onOpenPhoto={onOpenPhoto}
                  onPlayVideo={onPlayVideo}
                  onToast={onToast}
                  downloads={downloads}
                  onDownloadInline={onDownloadInline}
                  onOpenDownloaded={onOpenDownloaded}
                  onPauseDownload={onPauseDownload}
                  onResumeDownload={onResumeDownload}
                />
              ) : null}

              {!hasReactions && (mediaAfterText || !hasText) ? (
                <MessageMeta message={message} />
              ) : null}

              {message.postAuthor ? (
                <span className="g-message-signature">{message.postAuthor}</span>
              ) : null}

              {message.buttons && message.buttons.length > 0 ? (
                <div className="g-message-buttons">
                  {message.buttons.map((button, index) => (
                    <button
                      type="button"
                      key={`${button.text}-${index}`}
                      className="g-message-button"
                      onClick={() => {
                        if (button.url) {
                          void Browser.OpenURL(button.url);
                        } else {
                          onToast(t("chat.buttonUnavailable"));
                        }
                      }}
                    >
                      {button.text}
                    </button>
                  ))}
                </div>
              ) : null}

              {hasReactions ? (
                <div className="g-message-reactions">
                  {message.reactions?.map((reaction) => (
                    <button
                      type="button"
                      key={reaction.emoji}
                      className="g-reaction"
                      data-chosen={reaction.chosen || undefined}
                      aria-pressed={reaction.chosen || false}
                      title={t("chat.toggleReaction", { emoji: reaction.emoji })}
                      onClick={() =>
                        onReact?.(message, reaction.chosen ? null : reaction)
                      }
                    >
                      {reaction.url ? (
                        <img
                          className="g-reaction-emoji g-reaction-custom"
                          src={reaction.url}
                          alt={reaction.emoji}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      ) : (
                        <span className="g-reaction-emoji">{reaction.emoji}</span>
                      )}
                      <span className="g-reaction-count">{reaction.count}</span>
                    </button>
                  ))}
                  <span className="g-message-reaction-meta">
                    <MessageMeta message={message} />
                  </span>
                </div>
              ) : null}
            </div>


            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        {actions.map((action) => (
          <MessageContextItem
            key={action.key}
            action={action}
            separator={action.separatorBefore}
          />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MessageContextItem({
  action,
  separator,
}: {
  action: MessageAction;
  separator?: boolean;
}) {
  return (
    <>
      {separator ? <ContextMenuSeparator /> : null}
      <ContextMenuItem
        icon={<Icon name={action.icon} size={18} />}
        danger={action.danger}
        onSelect={action.run}
      >
        {action.label}
      </ContextMenuItem>
    </>
  );
}

const urlPattern = /https?:\/\/[^\s<>"']+/giu;

function AutoLinked({ text }: { text: string }) {
  const parts: Array<{ text: string; url?: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    const start = match.index ?? 0;
    let url = match[0];
    let trailing = "";
    while (url.length > 1 && /[).,;!?]$/u.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start) });
    }
    parts.push({ text: url, url });
    if (trailing) {
      parts.push({ text: trailing });
    }
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor) });
  }
  return (
    <>
      {parts.map((part, index) =>
        part.url ? (
          <a
            key={`${part.url}-${index}`}
            className="g-message-link"
            href={part.url}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void Browser.OpenURL(part.url!);
            }}
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={`text-${index}`}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Renders Telegram message entities (bold, code, spoilers, links, quotes) without a markdown parser. */
function MessageMeta({ message }: { message: Message }) {
  const { t } = useTranslation();
  return (
    <span className="g-message-meta">
      {message.editDate ? <span className="g-message-edited">{t("chat.edited")}</span> : null}
      {message.views ? (
        <span className="g-message-views">
          <Icon name="visibility" size={13} />
          {formatCompact(message.views)}
        </span>
      ) : null}
      <span>{message.time}</span>
      {message.out ? (
        message.checks === "read" ? (
          <Icon name="done_all" size={15} className="g-message-checks" />
        ) : (
          <Icon name="done" size={15} className="g-message-checks" />
        )
      ) : null}
    </span>
  );
}

function formatCompact(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return String(value);
}

/** Renders Telegram message entities (bold, code, spoilers, links, quotes) without a markdown parser. */
export function RichText({
  text,
  entities,
}: {
  text: string;
  entities?: Message["entities"];
}) {
  const [revealed, setRevealed] = useState(false);

  if (!entities || entities.length === 0) {
    return (
      <span className="g-message-text">
        <AutoLinked text={text} />
      </span>
    );
  }

  const boundaries = new Set<number>([0, text.length]);
  for (const entity of entities) {
    const start = Math.max(0, Math.min(text.length, entity.offset));
    const end = Math.max(start, Math.min(text.length, entity.offset + entity.length));
    boundaries.add(start);
    boundaries.add(end);
  }
  const ordered = [...boundaries].sort((left, right) => left - right);

  const segments: ReactNode[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (end <= start) {
      continue;
    }
    const active = entities.filter(
      (entity) => entity.offset <= start && entity.offset + entity.length >= end,
    );
    const segment = text.slice(start, end);
    let node = <AutoLinked text={segment} />;

    const link = active.find(
      (entity) => entity.type === "link" || entity.type === "url",
    );
    if (link) {
      const href =
        link.type === "link" && link.url
          ? link.url
          : /^https?:\/\//iu.test(segment)
            ? segment
            : `https://${segment}`;
      node = (
        <a
          className="g-message-link"
          href={href}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void Browser.OpenURL(href);
          }}
        >
          {node}
        </a>
      );
    }

    if (active.some((entity) => entity.type === "code")) {
      node = <code className="g-text-code">{node}</code>;
    }
    if (active.some((entity) => entity.type === "pre")) {
      const language = active.find((entity) => entity.type === "pre")?.language;
      node = (
        <span className="g-text-pre" data-language={language || undefined}>
          {node}
        </span>
      );
    }
    if (active.some((entity) => entity.type === "bold")) {
      node = <strong>{node}</strong>;
    }
    if (active.some((entity) => entity.type === "italic")) {
      node = <em>{node}</em>;
    }
    if (active.some((entity) => entity.type === "underline")) {
      node = <u>{node}</u>;
    }
    if (active.some((entity) => entity.type === "strike")) {
      node = <s>{node}</s>;
    }
    if (active.some((entity) => entity.type === "blockquote")) {
      node = <span className="g-text-quote">{node}</span>;
    }
    if (active.some((entity) => entity.type === "spoiler")) {
      node = (
        <span
          className="g-text-spoiler"
          data-revealed={revealed || undefined}
          onClick={(event) => {
            event.stopPropagation();
            setRevealed((current) => !current);
          }}
        >
          {node}
        </span>
      );
    }
    if (active.some((entity) => entity.type === "custom_emoji")) {
      node = (
        <span className="g-custom-emoji">
          {segment === "\uFFFC" ? "✨" : node}
        </span>
      );
    }

    segments.push(<Fragment key={`${start}-${end}`}>{node}</Fragment>);
  }

  return <span className="g-message-text">{segments}</span>;
}

