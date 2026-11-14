import type { CSSProperties } from "react";
import type { Chat } from "../../types";
import { Avatar, Icon } from "../../ui";

/**
 * Chat avatar. The backend puts a loopback HTTP URL on the chat DTO, so the
 * WebView loads the photo natively and caches it exactly like a normal web page
 * image. No base64 RPC or per-photo file next to the executable.
 *
 * Saved Messages uses Telegram's bookmark glyph instead of initials.
 */
export function ChatAvatar({
  chat,
  size = 42,
  className,
  slot,
}: {
  chat: Chat;
  size?: number;
  className?: string;
  slot?: string;
}) {
  if (chat.saved) {
    return (
      <span className="g-chat-avatar" slot={slot}>
        <span
          className="f-avatar f-saved-avatar"
          style={
            {
              "--avatar-size": `${size}px`,
              "--avatar-color": "var(--accent-9)",
            } as CSSProperties
          }
          title={chat.title}
          aria-hidden="true"
        >
          <Icon name="bookmark" size={Math.round(size * 0.46)} strokeWidth={2} />
        </span>
      </span>
    );
  }
  return (
    <span className="g-chat-avatar" slot={slot}>
      <Avatar
        title={chat.title}
        initials={chat.initials}
        color={chat.color}
        size={size}
        online={chat.online}
        photo={chat.avatarUrl}
        className={className}
      />
    </span>
  );
}

export function clearChatAvatarCache() {
  // Avatars are owned by the WebView HTTP cache now; nothing to clear here.
}
