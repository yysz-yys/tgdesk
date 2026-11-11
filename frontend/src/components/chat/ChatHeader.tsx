import { useTranslation } from "react-i18next";
import {
  IconDots,
  IconDownload,
  IconInfoCircle,
  IconPhone,
  IconSearch,
  IconSelectAll,
} from "@tabler/icons-react";
import type { Chat } from "../../types";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";

interface ChatHeaderProps {
  chat: Chat;
  rightOpen: boolean;
  onOpenInfo: () => void;
  onSelectAll: () => void;
  onDownloadAll: () => void;
  onToast: (message: string) => void;
}

export function ChatHeader({
  chat,
  rightOpen,
  onOpenInfo,
  onSelectAll,
  onDownloadAll,
  onToast,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const subtitle =
    chat.kind === "private"
      ? chat.online
        ? t("chat.online")
        : t("chat.lastSeen")
      : (chat.members ?? t(chat.kind === "channel" ? "chat.channel" : "chat.group"));

  return (
    <header className="chat-header tg-chat-header">
      <button
        type="button"
        className="tg-chat-identity"
        onClick={onOpenInfo}
        aria-label={t("chat.chatInfo")}
        aria-expanded={rightOpen}
      >
        <Avatar
          title={chat.title}
          initials={chat.initials}
          color={chat.color}
          size={42}
          online={chat.online}
        />
        <span className="chat-header-copy">
          <span className="chat-header-title">{chat.title}</span>
          <span className="chat-header-subtitle" data-online={chat.online}>
            {chat.online ? <span className="online-dot" /> : null}
            {subtitle}
          </span>
        </span>
      </button>

      <div className="tg-chat-header-actions">
        <IconButton label={t("chat.searchInChat")} onClick={() => onToast(t("chat.searchToast"))}>
          <IconSearch size={21} stroke={1.8} />
        </IconButton>
        <IconButton
          label={t("chat.call")}
          onClick={() => onToast(t("chat.callsSoon"))}
          className="tg-chat-call"
        >
          <IconPhone size={20} stroke={1.8} />
        </IconButton>
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="icon-button" aria-label={t("chat.chatMenu")}>
              <IconDots size={21} stroke={1.8} />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<IconSelectAll size={16} />} onSelect={onSelectAll}>
              {t("chat.selectAll")}
            </MenuItem>
            <MenuItem icon={<IconDownload size={16} />} onSelect={onDownloadAll}>
              {t("chat.downloadAll")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<IconInfoCircle size={16} />} onSelect={onOpenInfo}>
              {t("chat.chatInfo")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}
