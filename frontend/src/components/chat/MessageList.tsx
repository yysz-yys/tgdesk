import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message } from "../../types";
import { chatColor, chatInitials } from "../../data/telegram";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { MessageBubble, type MessageAuthor } from "./MessageBubble";
import type { ChatAvatarLoader } from "./ChatAvatar";

interface MessageListProps {
  chatId: string;
  chatTitle: string;
  chatInitials: string;
  chatColor: string;
  selfName: string;
  selfInitials: string;
  selfColor: string;
  messages: Message[];
  selectedIds: Set<number>;
  showSender?: boolean;
  showAvatars?: boolean;
  hasMoreMessages: boolean;
  olderMessagesLoading: boolean;
  onLoadOlder: () => void;
  onLoadAvatar: ChatAvatarLoader;
  onPlayVideo?: (message: Message) => void;
  onToggleSelect: (id: number) => void;
  onDownloadMessage?: (id: number) => void;
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onToast: (message: string) => void;
}

export function MessageList({
  chatId,
  chatTitle,
  chatInitials: peerInitials,
  chatColor: peerColor,
  selfName,
  selfInitials,
  selfColor,
  messages,
  selectedIds,
  showSender,
  showAvatars = false,
  hasMoreMessages,
  olderMessagesLoading,
  onLoadOlder,
  onLoadAvatar,
  onPlayVideo,
  onToggleSelect,
  onDownloadMessage,
  onLoadThumbnail,
  onToast,
}: MessageListProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageCount = useRef(messages.length);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

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

  return (
    <div className="g-message-layer">
      <div className="g-message-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="g-message-list">
        {hasMoreMessages ? (
          <div className="g-load-older">
            <button
              type="button"
              className="g-load-older-button"
              disabled={olderMessagesLoading}
              onClick={onLoadOlder}
            >
              {olderMessagesLoading ? (
                <Spinner size={16} />
              ) : (
                <Icon name="history" size={17} />
              )}
              {olderMessagesLoading ? t("chat.loadingOlder") : t("chat.loadOlder")}
            </button>
          </div>
        ) : null}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const showDate = !previous || previous.date !== message.date;
          const sameSenderAsPrevious =
            !showDate &&
            previous?.sender === message.sender &&
            previous?.out === message.out;
          const sameSenderAsNext =
            next?.date === message.date &&
            next?.sender === message.sender &&
            next?.out === message.out;

          if (message.service) {
            return (
              <div key={message.id} className="g-message-block" data-message-id={message.id}>
                {showDate ? <div className="g-date-chip">{message.date}</div> : null}
                <div className="g-service-message">
                  <span>{message.service}</span>
                  <span className="g-service-time">{message.time}</span>
                </div>
              </div>
            );
          }

          const author: MessageAuthor = message.out
            ? { name: selfName, initials: selfInitials, color: selfColor }
            : {
                name: message.sender || chatTitle,
                initials: message.sender ? chatInitials(message.sender) : peerInitials,
                color: message.sender ? chatColor(message.sender) : peerColor,
              };

          return (
            <div key={message.id} className="g-message-block" data-message-id={message.id}>
              {showDate ? <div className="g-date-chip">{message.date}</div> : null}
              <MessageBubble
                message={message}
                author={author}
                replyTo={message.replyToId ? byId.get(message.replyToId) : undefined}
                selected={selectedIds.has(message.id)}
                showSender={Boolean(showSender && !sameSenderAsPrevious)}
                showAvatar={showAvatars}
                grouped={sameSenderAsPrevious}
                lastInGroup={!sameSenderAsNext}
                onLoadAvatar={onLoadAvatar}
                onPlayVideo={onPlayVideo}
                onToggleSelect={onToggleSelect}
                onDownloadMessage={onDownloadMessage}
                onLoadThumbnail={onLoadThumbnail}
                onToast={onToast}
              />
            </div>
          );
        })}
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
