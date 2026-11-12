import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { SearchField } from "../ui/SearchField";
import { ChatRow } from "../chat/ChatRow";
import type { ChatAvatarLoader } from "../chat/ChatAvatar";

interface SidebarProps {
  chats: Chat[];
  selectedChatId: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChat: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDownloadAll: (chat: Chat) => void;
  onToast: (message: string) => void;
  onLoadAvatar: ChatAvatarLoader;
  onMenu: () => void;
  onCompose: () => void;
  accountRestricted?: boolean;
  accountRestriction?: string;
  loading?: boolean;
  failed?: boolean;
}

export function Sidebar({
  chats,
  selectedChatId,
  query,
  onQueryChange,
  onSelectChat,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onDownloadAll,
  onToast,
  onLoadAvatar,
  onMenu,
  onCompose,
  accountRestricted,
  accountRestriction,
  loading,
  failed,
}: SidebarProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const unreadCount = chats.filter((chat) => Boolean(chat.unread)).length;
  const visibleChats = filter === "unread" ? chats.filter((chat) => Boolean(chat.unread)) : chats;
  const emptyText = failed
    ? t("chat.loadChatsFailed")
    : query
      ? t("sidebar.noMatches", { query })
      : filter === "unread"
        ? t("sidebar.noUnread")
        : t("chat.noChats");

  return (
    <aside className="g-sidebar" aria-label={t("sidebar.chats")}>
      <div className="g-list-head">
        <IconButton
          label={t("common.mainNavigation")}
          icon="menu"
          onClick={onMenu}
        />
        <SearchField
          value={query}
          onValueChange={onQueryChange}
          placeholder={t("sidebar.searchPlaceholder")}
          label={t("sidebar.searchChats")}
          clearLabel={t("sidebar.clearSearch")}
        />
      </div>

      <div className="g-list-filters" role="tablist" aria-label={t("sidebar.chats")}>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          data-active={filter === "all" || undefined}
          onClick={() => setFilter("all")}
        >
          {t("sidebar.all")}
          <span>{chats.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "unread"}
          data-active={filter === "unread" || undefined}
          onClick={() => setFilter("unread")}
        >
          {t("sidebar.unread")}
          <span>{unreadCount}</span>
        </button>
      </div>

      {accountRestricted ? (
        <button
          type="button"
          className="g-restricted-banner"
          onClick={() => onToast(accountRestriction || t("sidebar.restrictedDetail"))}
        >
          <Icon name="error" size={20} filled />
          <span>
            <strong>{t("sidebar.restricted")}</strong>
            <small>{t("sidebar.restrictedDetails")}</small>
          </span>
        </button>
      ) : null}

      <div className="g-sidebar-scroll">
        {loading ? (
          <div className="g-chat-list" aria-busy="true" aria-label={t("chat.loadingChats")}>
            {Array.from({ length: 9 }).map((_, index) => (
              <div className="g-chat-skeleton" key={index} aria-hidden="true">
                <span className="g-chat-skeleton-avatar" />
                <span className="g-chat-skeleton-copy">
                  <span style={{ width: `${48 + ((index * 13) % 30)}%` }} />
                  <span style={{ width: `${70 + ((index * 7) % 24)}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : visibleChats.length > 0 ? (
          <div className="g-chat-list">
            {visibleChats.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                active={selectedChatId === chat.id}
                onSelect={onSelectChat}
                onTogglePin={onTogglePin}
                onToggleMute={onToggleMute}
                onMarkRead={onMarkRead}
                onDownloadAll={onDownloadAll}
                onToast={onToast}
                onLoadAvatar={onLoadAvatar}
              />
            ))}
          </div>
        ) : (
          <div className="g-sidebar-empty">
            <Icon
              name={query ? "search_off" : filter === "unread" ? "mark_email_read" : failed ? "cloud_off" : "forum"}
              size={28}
            />
            <p>{emptyText}</p>
          </div>
        )}
      </div>

      <button
        type="button"
        className="g-compose-fab"
        aria-label={t("chat.newMessage")}
        onClick={onCompose}
      >
        <Icon name="edit" size={23} />
      </button>
    </aside>
  );
}
