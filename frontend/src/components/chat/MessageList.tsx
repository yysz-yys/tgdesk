import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconArrowDown } from "@tabler/icons-react";
import type { Message } from "../../types";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  chatId: string;
  messages: Message[];
  selectedIds: Set<number>;
  showSender?: boolean;
  onToggleSelect: (id: number) => void;
  onDownloadMessage?: (id: number) => void;
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onToast: (message: string) => void;
}

export function MessageList({
  chatId,
  messages,
  selectedIds,
  showSender,
  onToggleSelect,
  onDownloadMessage,
  onLoadThumbnail,
  onToast,
}: MessageListProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
    setShowJump(false);
  }, [chatId]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    setShowJump(node.scrollHeight - node.scrollTop - node.clientHeight > 180);
  };

  const jumpToBottom = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="message-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="message-list">
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
              <div key={message.id}>
                {showDate && <div className="date-pill">{message.date}</div>}
                <div className="service-message">
                  <span>{message.service}</span>
                  <span className="service-time">{message.time}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={message.id}>
              {showDate && <div className="date-pill">{message.date}</div>}
              <MessageBubble
                message={message}
                selected={selectedIds.has(message.id)}
                showSender={showSender && !sameSenderAsPrevious}
                tail={!sameSenderAsNext}
                onToggleSelect={onToggleSelect}
                onDownloadMessage={onDownloadMessage}
                onLoadThumbnail={onLoadThumbnail}
                onToast={onToast}
              />
            </div>
          );
        })}
      </div>

      {showJump && (
        <button
          type="button"
          className="scroll-bottom"
          onClick={jumpToBottom}
          aria-label={t("chat.jumpLatest")}
        >
          <IconArrowDown size={21} stroke={2} />
        </button>
      )}
    </div>
  );
}
