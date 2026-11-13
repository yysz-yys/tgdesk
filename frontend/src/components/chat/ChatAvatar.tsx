import type { Chat } from "../../types";
import { Avatar } from "../../ui";

/**
 * Chat avatar. The backend puts a loopback HTTP URL on the chat DTO, so the
 * WebView loads the photo natively and caches it exactly like a normal web page
 * image. No base64 RPC or per-photo file next to the executable.
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
