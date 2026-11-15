import { useTranslation } from "react-i18next";
import type { ChatKind } from "../../types";
import { typingDescription, useChatTyping } from "../../lib/typingStore";
import "./typing-dots.css";

/**
 * The three animated dots of a Web K typing indicator
 * (`span.peer-typing > span.peer-typing-text > -dot-first/-dot/-dot-last`,
 * `scss/partials/_peerTyping.scss`). Colours come from `currentColor`, so the
 * chat list can paint them secondary and the chat header accent.
 */
export function TypingDots() {
  return (
    <span className="peer-typing" aria-hidden="true">
      <span className="peer-typing-text">
        <span className="peer-typing-text-dot peer-typing-text-dot-first" />
        <span className="peer-typing-text-dot" />
        <span className="peer-typing-text-dot peer-typing-text-dot-last" />
      </span>
    </span>
  );
}

/**
 * A complete typing line: dots + localized description ("typing",
 * "Name is typing", ...). Renders nothing when the peer is not typing.
 */
export function TypingIndicator({
  chatId,
  kind,
  isBot,
  className,
}: {
  chatId: string;
  kind: ChatKind;
  isBot?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const entries = useChatTyping(chatId);
  const description = typingDescription(entries, kind, isBot);
  if (!description) {
    return null;
  }
  const label = description.options
    ? t(description.key, description.options)
    : t(description.key);
  return (
    <span
      className={
        className
          ? `peer-typing-container ${className}`
          : "peer-typing-container"
      }
      aria-label={label}
    >
      <TypingDots />
      <span className="peer-typing-description" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
