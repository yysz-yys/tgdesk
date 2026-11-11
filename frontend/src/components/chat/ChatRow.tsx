import { useTranslation } from "react-i18next";
import {
  IconCheck,
  IconDownload,
  IconLink,
  IconPin,
  IconVolumeOff,
} from "@tabler/icons-react";
import type { Chat } from "../../types";
import { Avatar } from "../ui/Avatar";
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
          className="chat-row"
          data-active={active}
          aria-current={active ? "page" : undefined}
          onClick={() => onSelect(chat.id)}
        >
          <Avatar
            title={chat.title}
            initials={chat.initials}
            color={chat.color}
            online={chat.online}
          />

          <span className="chat-body">
            <span className="chat-topline">
              <span className="chat-title">{chat.title}</span>
              <span className="chat-flags">
                {chat.muted && <IconVolumeOff size={13} stroke={2} />}
                {chat.pinned && <IconPin className="pin-mark" size={13} stroke={2} />}
              </span>
            </span>
            <span className="chat-bottomline">
              <span className="chat-preview">{chat.preview}</span>
            </span>
          </span>

          <span className="chat-side">
            <span className="chat-time">{chat.time}</span>
            {!!chat.unread && (
              <span className="chat-badge" data-muted={chat.muted}>
                {chat.unread > 99 ? "99+" : chat.unread}
              </span>
            )}
          </span>
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem icon={<IconPin size={16} />} onSelect={() => onTogglePin(chat.id)}>
          {chat.pinned ? t("chatMenu.unpin") : t("chatMenu.pin")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<IconVolumeOff size={16} />}
          onSelect={() => onToggleMute(chat.id)}
        >
          {chat.muted ? t("chatMenu.unmute") : t("chatMenu.mute")}
        </ContextMenuItem>
        <ContextMenuItem icon={<IconCheck size={16} />} onSelect={() => onMarkRead(chat.id)}>
          {t("chatMenu.markRead")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<IconDownload size={16} />} onSelect={() => onDownloadAll(chat)}>
          {t("chatMenu.downloadAll")}
        </ContextMenuItem>
        <ContextMenuItem icon={<IconLink size={16} />} onSelect={() => void copyLink()}>
          {t("chatMenu.copyLink")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
