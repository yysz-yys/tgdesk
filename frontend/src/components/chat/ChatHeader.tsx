import { useTranslation } from "react-i18next";
import {
  IconDots,
  IconDownload,
  IconSearch,
  IconSelectAll,
} from "@tabler/icons-react";
import type { Chat } from "../../types";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";

interface ChatHeaderProps {
  chat: Chat;
  searchOpen: boolean;
  onSearch: () => void;
  onSelectAll: () => void;
  onDownloadAll: () => void;
}

export function ChatHeader({
  chat,
  searchOpen,
  onSearch,
  onSelectAll,
  onDownloadAll,
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
      <div className="tg-chat-identity">
        <span className="chat-header-copy">
          <span className="chat-header-title">{chat.title}</span>
          <span className="chat-header-subtitle" data-online={chat.online}>
            {chat.online ? <span className="online-dot" /> : null}
            {subtitle}
          </span>
        </span>
      </div>

      <div className="tg-chat-header-actions">
        <IconButton label={t("chat.searchInChat")} active={searchOpen} onClick={onSearch}>
          <IconSearch size={21} stroke={1.8} />
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
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}
