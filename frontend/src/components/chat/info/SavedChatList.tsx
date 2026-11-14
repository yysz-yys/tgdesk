import { useMemo } from "react";
import type { Chat } from "../../../types";
import { Icon } from "../../../ui";
import { ChatAvatar } from "../ChatAvatar";

/**
 * Saved Messages 2.0 "Chats" tab. Telegram Web K lists the source chats of the
 * saved messages as dialog rows: pinned first, then 48 px avatar, title, last
 * saved-message preview and (when the server reports them) unread badges.
 */
export function SavedChatList({
  chats,
  onOpenChat,
  unavailable,
}: {
  chats: Chat[];
  /** Opens the source chat when the shell wires in-app navigation. */
  onOpenChat: (chat: Chat) => void;
  /** Disables the rows when the shell has no route for saved chats yet. */
  unavailable?: boolean;
}) {
  // `messages.getPinnedSavedDialogs` already returns pinned-first, but the
  // pinned rule is a product requirement, so enforce it with a stable sort.
  const ordered = useMemo(
    () =>
      chats
        .map((chat, index) => ({ chat, index }))
        .sort((left, right) => {
          const pinDelta =
            Number(Boolean(right.chat.pinned)) -
            Number(Boolean(left.chat.pinned));
          return pinDelta !== 0 ? pinDelta : left.index - right.index;
        })
        .map((entry) => entry.chat),
    [chats],
  );

  return (
    <div className="f-info-saved-chats">
      {ordered.map((chat) => (
        <button
          key={chat.id}
          type="button"
          className="f-info-saved-chat"
          data-unavailable={unavailable || undefined}
          title={chat.title}
          onClick={() => onOpenChat(chat)}
        >
          <ChatAvatar chat={chat} size={48} />
          <span className="f-info-saved-chat-copy">
            <b>{chat.title}</b>
            {chat.preview ? <small>{chat.preview}</small> : null}
          </span>
          <span className="f-info-saved-chat-meta">
            {chat.pinned ? (
              <Icon
                name="push_pin"
                size={14}
                className="f-info-saved-chat-pin"
              />
            ) : null}
            {chat.unread ? (
              <span className="f-info-saved-chat-badge">
                {chat.unread > 99 ? "99+" : chat.unread}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
