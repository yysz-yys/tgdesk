import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DownloadTask, Message, MessageButton, Reaction } from "../../types";
import type { ViewerSource } from "../media/types";
import {
  openTelegramLink,
  openTelegramUsername,
} from "../../lib/telegramLinks";
import { peerMessageColor } from "../../data/telegram";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Icon,
} from "../../ui";
import { KIcon } from "../k/KIcon";
import { PeerAvatar } from "./PeerAvatar";
import { EmojiText } from "./EmojiText";
import { MessageMediaView, isBleedMedia } from "./MessageMediaView";
import { BotKeyboard } from "./BotKeyboard";
import { ChannelCommentsBar } from "./ChannelCommentsBar";
import "./bubble-k.css";
import "./comments-k.css";

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
  /** Opens the channel post's linked discussion chat (comments bar press). */
  onOpenComments?: (message: Message) => void;
  /** Bot inline-keyboard callback press (AppService.SendBotCallback). */
  onBotCallback?: (message: Message, button: MessageButton) => void;
  /** Bot web app button press (opens the in-app mini app overlay). */
  onBotWebView?: (message: Message, button: MessageButton) => void;
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
  onOpenComments,
  onBotCallback,
  onBotWebView,
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
  /** Web K's message peer focus colour: author peer (channels fall back to the
   * chat itself through message.chatId); blockquotes and quote-like accents use
   * it via `--peer-color-rgb` (tweb `setPeerColorToElement`). */
  const peerFocusColor = peerMessageColor(message.senderId || message.chatId);

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
  // A channel post with comments keeps its plate even without a caption: the
  // comments footer is the bottom row of that plate (Web K appends
  // `replies-element` inside `.bubble-content`).
  const commentsEnabled = Boolean(message.commentsEnabled);
  const bareMedia = Boolean(
    media &&
      !hasText &&
      !hasReactions &&
      !message.replyToId &&
      !message.forwarded &&
      !message.buttons?.length &&
      !message.postAuthor &&
      !commentsEnabled &&
      (media.kind === "photo" ||
        media.kind === "video" ||
        media.kind === "video_note" ||
        media.kind === "animation"),
  );

  // The inline keyboard rounds its outer bottom corners into the bubble tail
  // only when nothing follows it (reactions/signature), mirroring the bubble's
  // own bottom radii (grouped bubbles tuck the corner to 5px).
  const keyboardIsLast = !hasReactions && !message.postAuthor;
  const bubbleBottomStartRadius = !message.out && !lastInGroup ? 5 : 15;
  const bubbleBottomEndRadius = message.out && !lastInGroup ? 5 : 15;

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
              seed={message.senderId}
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
              style={
                {
                  "--peer-color": peerFocusColor,
                  "--peer-color-rgb": peerColorRgb(peerFocusColor),
                } as CSSProperties
              }
            >
              {showSender ? (
                <span
                  className="g-message-author k-message-name"
                  dir="auto"
                  style={
                    {
                      "--peer-color": author.color,
                      "--peer-color-rgb": peerColorRgb(author.color),
                    } as CSSProperties
                  }
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
                <BotKeyboard
                  message={message}
                  onBotCallback={onBotCallback}
                  onBotWebView={onBotWebView}
                  onToast={onToast}
                  lastElement={keyboardIsLast}
                  bottomStartRadius={bubbleBottomStartRadius}
                  bottomEndRadius={bubbleBottomEndRadius}
                />
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

              {commentsEnabled ? (
                <ChannelCommentsBar message={message} onOpen={onOpenComments} />
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
              openTelegramLink(part.url!);
            }}
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={`text-${index}`}>
            <EmojiText text={part.text} />
          </Fragment>
        ),
      )}
    </>
  );
}

/** Web K's `.time` row: [edited][views number][views icon][time][checks]. */
function MessageMeta({ message }: { message: Message }) {
  const { t } = useTranslation();
  // A hidden copy reserves the layout room in the text's last line, and
  // `.time-inner` paints the visible row at the bubble's bottom end
  // (`_chatBubble.scss:1898-1971`; views come count-then-glyph per
  // `messageRender.ts:362-375`).
  const content = (
    <>
      {message.editDate ? <span className="g-message-edited">{t("chat.edited")}</span> : null}
      {message.views ? (
        <span className="g-message-views">
          <span className="g-message-views-count">{formatCompact(message.views)}</span>
          <KIcon name="channelviews_filled" className="g-message-views-icon" />
        </span>
      ) : null}
      <span className="k-message-meta-time">{message.time}</span>
      {message.checks ? (
        message.checks === "read" ? (
          <Icon name="done_all" size={19} className="g-message-checks" />
        ) : (
          <Icon name="done" size={19} className="g-message-checks" />
        )
      ) : null}
    </>
  );
  return (
    <span className="g-message-meta k-message-meta">
      <span className="k-message-meta-spacer" aria-hidden="true">
        {content}
      </span>
      <span className="k-message-meta-inner">{content}</span>
    </span>
  );
}

function peerColorRgb(color?: string): string | undefined {
  if (!color) {
    return undefined;
  }
  if (!color.startsWith("#")) {
    return undefined;
  }
  let hex = color.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((value) => value + value)
      .join("");
  }
  if (hex.length < 6) {
    return undefined;
  }
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  if (![red, green, blue].every((value) => Number.isFinite(value))) {
    return undefined;
  }
  return `${red}, ${green}, ${blue}`;
}

/** Web K's `formatNumber(views, 1)`: 1.3K, 12.4K, 1K (a trailing .0 drops). */
function formatCompact(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return String(value || 0);
  }
  if (value < 1000) {
    return String(value);
  }
  const units = ["", "K", "M", "B", "T"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1000)),
    units.length - 1,
  );
  const scaled = parseFloat((value / 1000 ** index).toFixed(1));
  return `${scaled}${units[index]}`;
}

/** One blockquote range of the message text (`messageEntityBlockquote`). */
interface BlockquoteRange {
  offset: number;
  length: number;
  collapsed: boolean;
}

/** The outermost blockquote ranges in text order; nested ones stay inside
 * their parent block (only the outer range becomes a block). */
function blockquoteRanges(
  entities: Message["entities"],
  textLength: number,
): BlockquoteRange[] {
  if (!entities) {
    return [];
  }
  const sorted = entities
    .filter((entity) => entity.type === "blockquote")
    .map((entity) => {
      const start = Math.max(0, Math.min(textLength, entity.offset));
      const end = Math.max(
        start,
        Math.min(textLength, entity.offset + entity.length),
      );
      return {
        offset: start,
        length: end - start,
        collapsed: Boolean(entity.collapsed),
      };
    })
    .filter((range) => range.length > 0)
    .sort((left, right) => left.offset - right.offset || right.length - left.length);
  const ranges: BlockquoteRange[] = [];
  for (const range of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && range.offset < last.offset + last.length) {
      continue;
    }
    ranges.push(range);
  }
  return ranges;
}

/** Entities of `[from, to)`, rebased to that slice; blockquotes are handled by
 * `RichText` itself, so they are dropped here. */
function entitiesInRange(
  entities: Message["entities"],
  from: number,
  to: number,
): Message["entities"] {
  if (!entities) {
    return undefined;
  }
  const result: NonNullable<Message["entities"]> = [];
  for (const entity of entities) {
    if (entity.type === "blockquote") {
      continue;
    }
    const start = Math.max(from, entity.offset);
    const end = Math.min(to, entity.offset + entity.length);
    if (end <= start) {
      continue;
    }
    result.push({
      ...entity,
      offset: start - from,
      length: end - start,
    });
  }
  return result.length > 0 ? result : undefined;
}

/**
 * A Web K blockquote: one continuous quoted block (`.quote.quote-block
 * .quote-like`) with a 4px plate, a 3px accent bar, the quote glyph and - for
 * a `collapsed` entity - the three-line clamp with its expand chevron.
 *
 * tweb renders this through `wrapRichText.ts:952-985` + `_quote.scss`; the
 * expand/collapse state is measured and toggled like `makeQuoteCollapsable` /
 * `onQuoteClick` do it there (56px = 3 secondary lines + 2px).
 */
function QuoteBlock({
  text,
  entities,
  collapsed,
}: {
  text: string;
  entities?: Message["entities"];
  collapsed?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLQuoteElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !collapsed || expanded) {
      return;
    }
    const measure = () => {
      const full = element.scrollHeight;
      if (!full) {
        return;
      }
      element.style.setProperty("--k-quote-max-height", `${full}px`);
      setTruncated(full > element.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, collapsed, expanded]);

  const classes = ["k-quote"];
  if (collapsed) {
    classes.push("k-quote-collapsable");
    if (truncated && !expanded) {
      classes.push("is-truncated");
    }
    if (expanded) {
      classes.push("is-expanded");
    }
  }

  const toggle = () => setExpanded((value) => !value);

  return (
    <blockquote
      ref={ref}
      className={classes.join(" ")}
      dir="auto"
      onClick={(event) => {
        if (!collapsed) {
          return;
        }
        const target = event.target as HTMLElement;
        if (target.closest("a, .k-quote-collapse")) {
          return;
        }
        event.stopPropagation();
        toggle();
      }}
    >
      <InlineRun text={text} entities={entities} />
      {collapsed ? (
        <button
          type="button"
          className="k-quote-collapse"
          aria-label={t("chat.quoteFullText", { defaultValue: "Full quote" })}
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        />
      ) : null}
    </blockquote>
  );
}

/** The inline entities of one text run (bold, code, links, emoji, …). */
function InlineRun({
  text,
  entities,
}: {
  text: string;
  entities?: Message["entities"];
}) {
  const [revealed, setRevealed] = useState(false);

  if (!entities || entities.length === 0) {
    return <AutoLinked text={text} />;
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
            openTelegramLink(href);
          }}
        >
          {node}
        </a>
      );
    }

    const mention = active.find((entity) => entity.type === "mention");
    if (mention) {
      // Telegram Web opens @username mentions as chats inside the app.
      node = (
        <button
          type="button"
          className="g-message-mention"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openTelegramUsername(segment);
          }}
        >
          {node}
        </button>
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

  return <>{segments}</>;
}

/** Renders Telegram message entities (bold, code, spoilers, links, blockquotes)
 * without a markdown parser. */
export function RichText({
  text,
  entities,
}: {
  text: string;
  entities?: Message["entities"];
}) {
  if (!entities || entities.length === 0) {
    return (
      <span className="g-message-text">
        <AutoLinked text={text} />
      </span>
    );
  }

  const quotes = blockquoteRanges(entities, text.length);
  if (quotes.length === 0) {
    return (
      <span className="g-message-text">
        <InlineRun text={text} entities={entities} />
      </span>
    );
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  const pushRun = (from: number, to: number, afterBlock: boolean) => {
    let start = from;
    // Web K consumes the first newline that follows a blockquote: the block
    // already ends the line, so a leading "\n" would add an empty line
    // (`wrapRichText.ts` ignores the inner linebreak the same way).
    if (afterBlock && start < to && text[start] === "\n") {
      start += 1;
    }
    if (start >= to) {
      return;
    }
    nodes.push(
      <InlineRun
        key={`run-${start}-${to}`}
        text={text.slice(start, to)}
        entities={entitiesInRange(entities, start, to)}
      />,
    );
  };
  quotes.forEach((quote, index) => {
    pushRun(cursor, quote.offset, index > 0);
    const end = quote.offset + quote.length;
    nodes.push(
      <QuoteBlock
        key={`quote-${end}`}
        text={text.slice(quote.offset, end)}
        entities={entitiesInRange(entities, quote.offset, end)}
        collapsed={quote.collapsed}
      />,
    );
    cursor = end;
  });
  pushRun(cursor, text.length, quotes.length > 0);

  return <span className="g-message-text">{nodes}</span>;
}
