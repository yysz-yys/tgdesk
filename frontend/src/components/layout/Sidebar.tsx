import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Icon } from "../ui/Icon";
import { PaneHeader } from "../ui/PaneHeader";
import { SearchField } from "../ui/SearchField";
import { ChatRow } from "../chat/ChatRow";

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
  accountRestricted,
  accountRestriction,
  loading,
  failed,
}: SidebarProps) {
  const { t } = useTranslation();
  const emptyText = failed
    ? t("chat.loadChatsFailed")
    : query
      ? t("sidebar.noMatches", { query })
      : t("chat.noChats");

  return (
    <aside className="g-sidebar" aria-label={t("sidebar.chats")}>
      <PaneHeader className="g-sidebar-header" title={t("sidebar.chats")} />

      <div className="g-sidebar-search">
        <SearchField
          value={query}
          onValueChange={onQueryChange}
          placeholder={t("sidebar.searchPlaceholder")}
          label={t("sidebar.searchChats")}
          clearLabel={t("sidebar.clearSearch")}
        />
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
        ) : chats.length > 0 ? (
          <div className="g-chat-list">
            {chats.map((chat) => (
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
              />
            ))}
          </div>
        ) : (
          <div className="g-sidebar-empty">
            <Icon name={query ? "search_off" : failed ? "cloud_off" : "forum"} size={28} />
            <p>{emptyText}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
