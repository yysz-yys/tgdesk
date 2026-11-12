import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { PaneHeader } from "../ui/PaneHeader";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";

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
    <PaneHeader
      className="g-chat-header"
      dense
      leading={
        <Avatar
          title={chat.title}
          initials={chat.initials}
          color={chat.color}
          size={38}
          online={chat.online}
        />
      }
      title={chat.title}
      titleAdornment={
        chat.verified ? (
          <Icon
            name="verified"
            size={16}
            filled
            className="g-chat-verified"
            label={t("chat.verified")}
          />
        ) : null
      }
      subtitle={
        <span className={chat.online ? "g-chat-online" : undefined}>
          {chat.online ? <span className="g-online-dot" /> : null}
          {subtitle}
        </span>
      }
      actions={
        <>
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
        </>
      }
    />
  );
}
