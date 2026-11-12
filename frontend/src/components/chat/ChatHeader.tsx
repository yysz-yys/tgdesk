import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { ChatAvatar, type ChatAvatarLoader } from "./ChatAvatar";

interface ChatHeaderProps {
  chat: Chat;
  searchOpen: boolean;
  onSearch: () => void;
  onSelectAll: () => void;
  onDownloadAll: () => void;
  onInfo: () => void;
  onLoadAvatar: ChatAvatarLoader;
}

export function ChatHeader({
  chat,
  searchOpen,
  onSearch,
  onSelectAll,
  onDownloadAll,
  onInfo,
  onLoadAvatar,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const subtitle =
    chat.kind === "private"
      ? chat.online
        ? t("chat.online")
        : t("chat.lastSeen")
      : (chat.members ?? t(chat.kind === "channel" ? "chat.channel" : "chat.group"));

  return (
    <header className="g-chat-header">
      <button
        type="button"
        className="g-chat-heading"
        onClick={onInfo}
        aria-label={`${chat.title}: ${t("rightPanel.chatInfo")}`}
      >
        <ChatAvatar chat={chat} size={38} loader={onLoadAvatar} />
        <span className="g-chat-heading-copy">
          <span className="g-chat-heading-title-row">
            <span className="g-chat-heading-title">{chat.title}</span>
            {chat.verified ? (
              <Icon
                name="verified"
                size={16}
                filled
                className="g-chat-verified"
                label={t("chat.verified")}
              />
            ) : null}
          </span>
          <span className={chat.online ? "g-chat-heading-subtitle g-chat-online" : "g-chat-heading-subtitle"}>
            {chat.online ? <span className="g-online-dot" /> : null}
            {subtitle}
          </span>
        </span>
      </button>

      <div className="g-chat-header-actions">
        <IconButton
          label={t("chat.searchInChat")}
          icon="search"
          variant={searchOpen ? "tonal" : "standard"}
          active={searchOpen}
          onClick={onSearch}
        />
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              label={t("chat.chatMenu")}
              icon="more_vert"
              tooltip={false}
            />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<Icon name="select_all" size={18} />} onSelect={onSelectAll}>
              {t("chat.selectAll")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Icon name="download" size={18} />} onSelect={onDownloadAll}>
              {t("chat.downloadAll")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}
