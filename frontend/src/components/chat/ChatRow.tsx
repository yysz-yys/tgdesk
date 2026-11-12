import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/ContextMenu";

interface ChatRowProps {
  chat: Chat;
  active: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDownloadAll: (chat: Chat) => void;
  onToast: (message: string) => void;
}

export function ChatRow({
  chat,
  active,
  onSelect,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onDownloadAll,
  onToast,
}: ChatRowProps) {
  const { t } = useTranslation();

  const copyLink = async () => {
    const link = chat.username
      ? `https://t.me/${chat.username.replace(/^@/, "")}`
      : `tg://openmessage?chat_id=${chat.id}`;
    try {
      await navigator.clipboard.writeText(link);
      onToast(t("chatMenu.copied"));
    } catch {
      onToast(link);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          className="g-chat-row"
          data-active={active || undefined}
          data-unread={(Boolean(chat.unread) && !active) || undefined}
          aria-current={active ? "page" : undefined}
          onClick={() => onSelect(chat.id)}
        >
          <Avatar
            title={chat.title}
            initials={chat.initials}
            color={chat.color}
            size={42}
            online={chat.online}
          />

          <span className="g-chat-body">
            <span className="g-chat-topline">
              <span className="g-chat-title">{chat.title}</span>
              {chat.verified ? (
                <Icon
                  className="g-chat-verified"
                  name="verified"
                  size={15}
                  filled
                  label={t("chat.verified")}
                />
              ) : null}
            </span>
            <span className="g-chat-bottomline">
              {chat.muted || chat.pinned ? (
                <span className="g-chat-flags" aria-hidden="true">
                  {chat.muted ? <Icon name="notifications_off" size={13} /> : null}
                  {chat.pinned ? <Icon name="keep" size={13} filled /> : null}
                </span>
              ) : null}
              <span className="g-chat-preview">{chat.preview}</span>
            </span>
          </span>

          <span className="g-chat-side">
            <span className="g-chat-time">{chat.time}</span>
            {chat.unread && !active ? <Badge count={chat.unread} muted={chat.muted} /> : null}
          </span>
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem
          icon={<Icon name="keep" size={18} />}
          onSelect={() => onTogglePin(chat.id)}
        >
          {chat.pinned ? t("chatMenu.unpin") : t("chatMenu.pin")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Icon name="notifications_off" size={18} />}
          onSelect={() => onToggleMute(chat.id)}
        >
          {chat.muted ? t("chatMenu.unmute") : t("chatMenu.mute")}
        </ContextMenuItem>
        <ContextMenuItem icon={<Icon name="done_all" size={18} />} onSelect={() => onMarkRead(chat.id)}>
          {t("chatMenu.markRead")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={<Icon name="download" size={18} />}
          onSelect={() => onDownloadAll(chat)}
        >
          {t("chatMenu.downloadAll")}
        </ContextMenuItem>
        <ContextMenuItem icon={<Icon name="link" size={18} />} onSelect={() => void copyLink()}>
          {t("chatMenu.copyLink")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
