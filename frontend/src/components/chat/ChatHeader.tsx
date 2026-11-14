import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { formatUserStatus } from "../../data/telegram";
import { Icon, IconButton, TextField } from "../../ui";
import { ChatAvatar } from "./ChatAvatar";

interface ChatHeaderProps {
  chat: Chat;
  infoOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResultCount: number;
  /** Saved Messages total (Telegram Web shows "N messages" as its subtitle). */
  savedMessagesCount?: number;
  onSearchQueryChange: (value: string) => void;
  onCloseSearch: () => void;
  onSearch: () => void;
  onDownloadAll: () => void;
  onInfo: () => void;
  onTogglePin?: (id: string) => void;
  onMarkRead?: (id: string) => void;
  onArchive?: (chat: Chat) => void;
}

export function ChatHeader({
  chat,
  infoOpen,
  searchOpen,
  searchQuery,
  searchResultCount,
  savedMessagesCount,
  onSearchQueryChange,
  onCloseSearch,
  onSearch,
  onDownloadAll,
  onInfo,
  onTogglePin,
  onMarkRead,
  onArchive,
}: ChatHeaderProps) {
  const { t, i18n } = useTranslation();
  const savedCountLabel =
    chat.saved && savedMessagesCount
      ? t("chat.messageCount", {
          formatted: new Intl.NumberFormat(i18n.resolvedLanguage ?? "en").format(
            savedMessagesCount,
          ),
        })
      : undefined;
  const subtitle =
    chat.kind === "private"
      ? chat.saved
        ? (savedCountLabel ?? t("chat.savedHint"))
        : chat.bot
          ? chat.username
            ? `@${chat.username}`
            : t("rightPanel.bot")
          : (formatUserStatus(
              chat.online,
              chat.status,
              chat.lastSeen,
              t,
              i18n.resolvedLanguage ?? "en",
            ) ?? t("chat.lastSeen"))
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
            <ChatAvatar chat={chat} size={40} />
            <span className="f-peer-copy">
              <span className="f-peer-name">
                {chat.title}
                {chat.verified ? (
                  <Icon
                    name="verified"
                    size={16}
                    className="f-peer-verified"
                    label={t("chat.verified")}
                  />
                ) : null}
              </span>
              <span className={chat.online ? "f-peer-sub f-peer-online" : "f-peer-sub"}>
                {subtitle}
              </span>
            </span>
          </button>

          <div className="f-chat-actions">
            <IconButton
              label={t("chat.searchInChat")}
              icon="search"
              size="3"
              iconSize={20}
              onClick={onSearch}
            />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  label={t("chat.chatMenu")}
                  icon="more_vert"
                  size="3"
                  iconSize={20}
                  tooltip={false}
                />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" sideOffset={6} className="f-menu-content">
                {onTogglePin ? (
                  <DropdownMenu.Item
                    className="f-menu-row"
                    onSelect={() => onTogglePin(chat.id)}
                  >
                    <Icon name="keep" size={16} />
                    <span>{chat.pinned ? t("chatMenu.unpin") : t("chatMenu.pin")}</span>
                  </DropdownMenu.Item>
                ) : null}
                {onMarkRead ? (
                  <DropdownMenu.Item
                    className="f-menu-row"
                    disabled={!chat.unread}
                    onSelect={() => onMarkRead(chat.id)}
                  >
                    <Icon name="done_all" size={16} />
                    <span>{t("chatMenu.markRead")}</span>
                  </DropdownMenu.Item>
                ) : null}
                {onArchive ? (
                  <DropdownMenu.Item
                    className="f-menu-row"
                    onSelect={() => onArchive(chat)}
                  >
                    <Icon
                      name={chat.archived ? "unarchive" : "archive"}
                      size={16}
                    />
                    <span>
                      {chat.archived ? t("chatMenu.unarchive") : t("chatMenu.archive")}
                    </span>
                  </DropdownMenu.Item>
                ) : null}
                <DropdownMenu.Separator className="f-menu-separator" />
                <DropdownMenu.Item className="f-menu-row" onSelect={onDownloadAll}>
                  <Icon name="download" size={16} />
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
