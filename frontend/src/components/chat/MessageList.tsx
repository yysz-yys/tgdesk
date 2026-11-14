import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DownloadTask, Message, MessageButton, Reaction } from "../../types";
import type { ViewerSource } from "../media/types";
import { chatColor, chatInitials } from "../../data/telegram";
import { Icon, Spinner } from "../../ui";
import { MessageBubble, type MessageAuthor } from "./MessageBubble";

/** Distance from the top that starts loading the previous page. */
const LOAD_OLDER_THRESHOLD = 300;

interface MessageListProps {  chatId: string;
  chatTitle: string;
  chatInitials: string;
  chatColor: string;
  chatAvatarUrl?: string;
  selfName: string;
  selfInitials: string;
  selfColor: string;
  selfAvatarUrl?: string;
  messages: Message[];
  showSender?: boolean;
  showAvatars?: boolean;
  hasMoreMessages: boolean;
  olderMessagesLoading: boolean;
  onLoadOlder: () => void;
  onPlayVideo?: (message: Message, source?: ViewerSource) => void;
  onOpenPhoto?: (message: Message, source?: ViewerSource) => void;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onForward?: (message: Message, group?: Message[]) => void;
  onDelete?: (message: Message, revoke: boolean, group?: Message[]) => void;
  onJumpToMessage?: (id: number) => void;
  onDownloadMessage?: (ids: number[]) => void;
  downloads?: DownloadTask[];
  onDownloadInline?: (ids: number[]) => void;
  onOpenDownloaded?: (task: DownloadTask) => void;
  onPauseDownload?: (task: DownloadTask) => void;
  onResumeDownload?: (task: DownloadTask) => void;
  onReact?: (message: Message, reaction: Reaction | null) => void;
  onOpenReactions?: (message: Message) => void;
  onBotCallback?: (message: Message, button: MessageButton) => void;
  onBotWebView?: (message: Message, button: MessageButton) => void;
  onToast: (message: string) => void;
}

export function MessageList({
  chatId,
  chatTitle,
  chatInitials: peerInitials,
  chatColor: peerColor,
  chatAvatarUrl,
  selfName,
  selfInitials,
  selfColor,
  selfAvatarUrl,
  messages,
  showSender,
  showAvatars = false,
  hasMoreMessages,
  olderMessagesLoading,
  onLoadOlder,
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
  onBotCallback,
  onBotWebView,
  onToast,
}: MessageListProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messageCount = useRef(messages.length);
  const stickToBottom = useRef(true);
  const loadingOlder = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const downloadsByMessage = useMemo(() => {
    const map = new Map<number, DownloadTask>();
    for (const task of downloads ?? []) {
      if (task.chatId === chatId && task.messageId > 0) {
        map.set(task.messageId, task);
      }
    }
    return map;
  }, [chatId, downloads]);

  // Telegram Web loads older history from the scroll position itself: reaching
  // the top starts the next page, and short histories keep filling until the
  // viewport is covered. There is no "load more" button.
  const maybeLoadOlder = () => {
    const node = scrollRef.current;
    if (
      !node ||
      !hasMoreMessages ||
      olderMessagesLoading ||
      loadingOlder.current
    ) {
      return;
    }
    if (node.scrollTop > LOAD_OLDER_THRESHOLD) {
      return;
    }
    loadingOlder.current = true;
    onLoadOlder();
  };

  useEffect(() => {
    if (!olderMessagesLoading) {
      loadingOlder.current = false;
    }
  }, [olderMessagesLoading]);

  useEffect(() => {
    if (!hasMoreMessages || olderMessagesLoading) {
      return;
    }
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    // A short first page does not scroll on its own; keep paging until the
    // conversation fills the pane, just like Telegram Web.
    if (node.scrollHeight <= node.clientHeight + LOAD_OLDER_THRESHOLD) {
      maybeLoadOlder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, hasMoreMessages, olderMessagesLoading]);

  // Thumbnails and avatars arrive after the history render. Keep the newest
  // message anchored while images above the viewport grow, like Telegram Web.
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [chatId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
    messageCount.current = messages.length;
    stickToBottom.current = true;
    setShowJump(false);
  }, [chatId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || messages.length <= messageCount.current) {
      messageCount.current = messages.length;
      return;
    }
    const sentByMe = messages[messages.length - 1]?.out === true;
    if (stickToBottom.current || sentByMe) {
      node.scrollTop = node.scrollHeight;
      stickToBottom.current = true;
      setShowJump(false);
    } else {
      setShowJump(true);
    }
    messageCount.current = messages.length;
  }, [messages.length]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottom.current = distance < 120;
    setShowJump(distance > 180);
    if (node.scrollTop <= LOAD_OLDER_THRESHOLD) {
      maybeLoadOlder();
    }
  };

  const jumpToBottom = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    stickToBottom.current = true;
    setShowJump(false);
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  };

  const byId = new Map(messages.map((message) => [message.id, message]));
  const previousFirstId = useRef<number | undefined>(messages[0]?.id);

  useEffect(() => {
    const first = messages[0]?.id;
    const previous = previousFirstId.current;
    if (first !== undefined && previous !== undefined && first !== previous) {
      const anchor = scrollRef.current?.querySelector(
        `[data-message-id="${previous}"]`,
      );
      anchor?.scrollIntoView({ block: "start" });
    }
    previousFirstId.current = first;
  }, [messages]);

  const renderedMessages: ReactNode[] = [];
  for (let index = 0; index < messages.length; ) {
    const message = messages[index];
    const previous = messages[index - 1];
    const showDate = !previous || previous.date !== message.date;

    if (message.service) {
      renderedMessages.push(
        <div key={message.id} className="g-message-block" data-message-id={message.id}>
          {showDate ? <div className="g-date-chip">{message.date}</div> : null}
          <div className="g-service-message">
            <span>{message.service}</span>
            <span className="g-service-time">{message.time}</span>
          </div>
        </div>,
      );
      index += 1;
      continue;
    }

    let album: Message[] | undefined;
    if (message.groupedId) {
      const group = [message];
      let cursor = index + 1;
      while (
        cursor < messages.length &&
        !messages[cursor].service &&
        messages[cursor].groupedId === message.groupedId
      ) {
        group.push(messages[cursor]);
        cursor += 1;
      }
      if (group.length > 1) {
        album = group;
      }
    }

    const lastIndex = album ? index + album.length - 1 : index;
    const next = messages[lastIndex + 1];
    const sameSenderAsPrevious =
      !showDate &&
      previous?.sender === message.sender &&
      previous?.out === message.out;
    const sameSenderAsNext =
      next?.date === message.date &&
      next?.sender === message.sender &&
      next?.out === message.out;

    const author: MessageAuthor = message.out
      ? {
          name: selfName,
          initials: selfInitials,
          color: selfColor,
          avatarUrl: selfAvatarUrl,
        }
      : {
          name: message.sender || chatTitle,
          initials: message.sender ? chatInitials(message.sender) : peerInitials,
          color: message.sender ? chatColor(message.sender) : peerColor,
          avatarUrl: message.senderAvatarUrl || chatAvatarUrl,
        };

    renderedMessages.push(
      <div
        key={message.id}
        className="g-message-block"
        data-message-id={message.id}
        data-album-ids={album?.map((item) => item.id).join(" ") || undefined}
      >
        {showDate ? <div className="g-date-chip">{message.date}</div> : null}
        <MessageBubble
          message={message}
          author={author}
          replyTo={message.replyToId ? byId.get(message.replyToId) : undefined}
          album={album}
          showSender={Boolean(showSender && !sameSenderAsPrevious)}
          showAvatar={Boolean(showAvatars && !sameSenderAsNext)}
          showAvatarSpace={Boolean(showAvatars)}
          grouped={sameSenderAsPrevious}
          lastInGroup={!sameSenderAsNext}
          onPlayVideo={onPlayVideo}
          onOpenPhoto={onOpenPhoto}
          onReply={onReply}
          onEdit={onEdit}
          onForward={onForward}
          onDelete={onDelete}
          onJumpToMessage={onJumpToMessage}
          onDownloadMessage={onDownloadMessage}
          downloads={downloadsByMessage}
          onDownloadInline={onDownloadInline}
          onOpenDownloaded={onOpenDownloaded}
          onPauseDownload={onPauseDownload}
          onResumeDownload={onResumeDownload}
          onReact={onReact}
          onOpenReactions={onOpenReactions}
          onBotCallback={onBotCallback}
          onBotWebView={onBotWebView}
          onToast={onToast}
        />
      </div>,
    );
    index = lastIndex + 1;
  }

  return (
    <div className="g-message-layer">
      <div className="g-message-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="g-message-list" ref={contentRef}>
        {hasMoreMessages && olderMessagesLoading ? (
          <div className="g-load-older g-load-older-auto" aria-live="polite">
            <Spinner size={16} />
          </div>
        ) : null}
        {renderedMessages}
        </div>
      </div>

      {showJump ? (
        <div className="g-jump-latest">
          <button
            type="button"
            className="g-jump-button"
            aria-label={t("chat.jumpLatest")}
            title={t("chat.jumpLatest")}
            onClick={jumpToBottom}
          >
            <Icon name="arrow_downward" size={22} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

