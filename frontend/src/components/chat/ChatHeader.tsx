import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Icon, IconButton, TextField } from "../../ui";
import { ChatAvatar } from "./ChatAvatar";

interface ChatHeaderProps {
  chat: Chat;
  infoOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResultCount: number;
  onSearchQueryChange: (value: string) => void;
  onCloseSearch: () => void;
  onSearch: () => void;
  onDownloadAll: () => void;
  onInfo: () => void;
}

export function ChatHeader({
  chat,
  infoOpen,
  searchOpen,
  searchQuery,
  searchResultCount,
  onSearchQueryChange,
  onCloseSearch,
  onSearch,
  onDownloadAll,
  onInfo,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const subtitle =
    chat.kind === "private"
      ? chat.online
        ? t("chat.online")
        : t("chat.lastSeen")
      : (chat.members ?? t(chat.kind === "channel" ? "chat.channel" : "chat.group"));

  return (
    <header className="f-chat-header" data-searching={searchOpen || undefined}>
      {searchOpen ? (
        <div className="f-chat-search">
          <TextField
            size="2"
            autoFocus
            value={searchQuery}
            onValueChange={onSearchQueryChange}
            placeholder={t("chat.searchLoadedPlaceholder")}
            aria-label={t("chat.searchLoadedPlaceholder")}
            leadingIcon="search"
            trailing={
              searchQuery.trim() ? (
                <span className="f-search-count">
                  {t("chat.searchResultCount", { count: searchResultCount })}
                </span>
              ) : undefined
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCloseSearch();
              }
            }}
          />
          <IconButton
            label={t("chat.searchClose")}
            icon="close"
            size="1"
            onClick={onCloseSearch}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            className="f-peer"
            data-active={infoOpen || undefined}
            onClick={onInfo}
            aria-expanded={infoOpen}
            aria-label={`${chat.title}: ${t("rightPanel.chatInfo")}`}
          >
            <ChatAvatar chat={chat} size={36} />
            <span className="f-peer-copy">
              <span className="f-peer-name">
                {chat.title}
                {chat.verified ? (
                  <Icon
                    name="verified"
                    size={14}
                    className="f-peer-verified"
                    label={t("chat.verified")}
                  />
                ) : null}
              </span>
              <span className={chat.online ? "f-peer-sub f-peer-online" : "f-peer-sub"}>
                {chat.online ? <span className="f-online-dot" /> : null}
                {subtitle}
              </span>
            </span>
          </button>

          <div className="f-chat-actions">
            <IconButton
              label={t("chat.searchInChat")}
              icon="search"
              size="2"
              iconSize={18}
              onClick={onSearch}
            />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  label={t("chat.chatMenu")}
                  icon="more_vert"
                  size="2"
                  iconSize={18}
                  tooltip={false}
                />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" sideOffset={6} className="f-menu-content">
                <DropdownMenu.Item className="f-menu-row" onSelect={onDownloadAll}>
                  <Icon name="download" size={15} />
                  <span>{t("chat.downloadAll")}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
        </>
      )}
    </header>
  );
}
