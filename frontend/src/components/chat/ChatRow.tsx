import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import {
  Badge,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Icon,
} from "../../ui";
import { ChatAvatar } from "./ChatAvatar";

interface ChatRowProps {
  chat: Chat;
  active: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDownloadAll: (chat: Chat) => void;
  onToggleArchive: (chat: Chat) => void;
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
  onToggleArchive,
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
          className="f-row"
          data-active={active || undefined}
          data-unread={(Boolean(chat.unread) && !active) || undefined}
          aria-current={active ? "page" : undefined}
          onClick={() => onSelect(chat.id)}
        >
          <ChatAvatar chat={chat} size={40} />

          <span className="f-row-body">
            <span className="f-row-top">
              <span className="f-row-title">
                {chat.title}
                {chat.verified ? (
                  <Icon
                    className="f-row-verified"
                    name="verified"
                    size={14}
                    label={t("chat.verified")}
                  />
                ) : null}
              </span>
              <span className="f-row-time">{chat.time}</span>
            </span>
            <span className="f-row-bottom">
              {chat.muted || chat.pinned ? (
                <span className="f-row-flags" aria-hidden="true">
                  {chat.muted ? <Icon name="notifications_off" size={12} /> : null}
                  {chat.pinned ? <Icon name="keep" size={12} /> : null}
                </span>
              ) : null}
              <span className="f-row-preview">{chat.preview}</span>
              {chat.unread && !active ? (
                <Badge count={chat.unread} muted={chat.muted} />
              ) : null}
            </span>
          </span>
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem
          icon={<Icon name="keep" size={16} />}
          onSelect={() => onTogglePin(chat.id)}
        >
          {chat.pinned ? t("chatMenu.unpin") : t("chatMenu.pin")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Icon name="notifications_off" size={16} />}
          onSelect={() => onToggleMute(chat.id)}
        >
          {chat.muted ? t("chatMenu.unmute") : t("chatMenu.mute")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Icon name="done_all" size={16} />}
          onSelect={() => onMarkRead(chat.id)}
        >
          {t("chatMenu.markRead")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Icon name={chat.archived ? "unarchive" : "archive"} size={16} />}
          onSelect={() => onToggleArchive(chat)}
        >
          {chat.archived ? t("chatMenu.unarchive") : t("chatMenu.archive")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={<Icon name="download" size={16} />}
          onSelect={() => onDownloadAll(chat)}
        >
          {t("chatMenu.downloadAll")}
        </ContextMenuItem>
        <ContextMenuItem icon={<Icon name="link" size={16} />} onSelect={copyLink}>
          {t("chatMenu.copyLink")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
