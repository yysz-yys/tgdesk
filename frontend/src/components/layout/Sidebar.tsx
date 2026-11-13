import { useState, type ElementType } from "react";
import { useTranslation } from "react-i18next";
import "@material/web/chips/chip-set.js";
import "@material/web/chips/filter-chip.js";
import "@material/web/fab/fab.js";
import "@material/web/list/list.js";
import type { Chat, ChatFolder } from "../../types";
import { chatMatchesFolder } from "../../data/folders";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { SearchField } from "../ui/SearchField";
import { ChatRow } from "../chat/ChatRow";
import type { ChatAvatarLoader } from "../chat/ChatAvatar";

const MdChipSet = "md-chip-set" as unknown as ElementType;
const MdFilterChip = "md-filter-chip" as unknown as ElementType;
const MdList = "md-list" as unknown as ElementType;
const MdFab = "md-fab" as unknown as ElementType;

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
  onToggleArchive: (chat: Chat) => void;
  onToast: (message: string) => void;
  onLoadAvatar: ChatAvatarLoader;
  onMenu: () => void;
  onCompose: () => void;
  folders: ChatFolder[];
  archivedCount: number;
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
  onToggleArchive,
  onToast,
  onLoadAvatar,
  onMenu,
  onCompose,
  folders,
  archivedCount,
  accountRestricted,
  accountRestriction,
  loading,
  failed,
}: SidebarProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const normalChats = chats.filter((chat) => !chat.archived);
  const archivedChats = chats.filter((chat) => chat.archived);
  const unreadCount = normalChats.filter((chat) => Boolean(chat.unread)).length;
  const selectedFolder = filter.startsWith("folder:")
    ? folders.find((folder) => `folder:${folder.id}` === filter)
    : undefined;
  const chatsForFilter = (value: string) => {
    const folder = value.startsWith("folder:")
      ? folders.find((item) => `folder:${item.id}` === value)
      : undefined;
    if (value === "unread") {
      return normalChats.filter((chat) => Boolean(chat.unread));
    }
    if (value === "archive") {
      return archivedChats;
    }
    if (folder) {
      return chats.filter((chat) => chatMatchesFolder(folder, chat));
    }
    return normalChats;
  };
  const changeFilter = (value: string) => {
    setFilter(value);
    const next = chatsForFilter(value);
    if (next.length > 0 && !next.some((chat) => chat.id === selectedChatId)) {
      onSelectChat(next[0].id);
    }
  };
  const visibleChats = chatsForFilter(filter);
  const emptyText = failed
    ? t("chat.loadChatsFailed")
    : query
      ? t("sidebar.noMatches", { query })
      : filter === "unread"
        ? t("sidebar.noUnread")
        : filter === "archive"
          ? t("sidebar.noArchived")
          : selectedFolder
            ? t("sidebar.emptyFolder")
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

      <MdChipSet className="g-list-filters" aria-label={t("sidebar.chats")}>
        <MdFilterChip
          label={`${t("sidebar.all")} ${normalChats.length}`}
          selected={filter === "all"}
          onClick={() => changeFilter("all")}
        />
        <MdFilterChip
          label={`${t("sidebar.unread")} ${unreadCount}`}
          selected={filter === "unread"}
          onClick={() => changeFilter("unread")}
        />
        {archivedCount > 0 ? (
          <MdFilterChip
            label={`${t("sidebar.archived")} ${archivedCount}`}
            selected={filter === "archive"}
            onClick={() => changeFilter("archive")}
          />
        ) : null}
        {folders.map((folder) => (
          <MdFilterChip
            key={folder.id}
            label={`${folder.emoticon ? `${folder.emoticon} ` : ""}${folder.title} ${
              chats.filter((chat) => chatMatchesFolder(folder, chat)).length
            }`}
            selected={filter === `folder:${folder.id}`}
            onClick={() => changeFilter(`folder:${folder.id}`)}
          />
        ))}
      </MdChipSet>

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
          <MdList className="g-chat-list" aria-label={t("sidebar.chats")}>
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
                onToggleArchive={onToggleArchive}
                onToast={onToast}
                onLoadAvatar={onLoadAvatar}
              />
            ))}
          </MdList>
        ) : (
          <div className="g-sidebar-empty">
            <Icon
              name={
                query
                  ? "search_off"
                  : filter === "unread"
                    ? "mark_email_read"
                    : filter === "archive"
                      ? "archive"
                      : selectedFolder
                        ? "folder"
                        : failed
                          ? "cloud_off"
                          : "forum"
              }
              size={28}
            />
            <p>{emptyText}</p>
          </div>
        )}
      </div>

      <MdFab
        className="g-compose-fab"
        variant="primary"
        aria-label={t("chat.newMessage")}
        onClick={onCompose}
      >
        <Icon slot="icon" name="edit" size={24} />
      </MdFab>
    </aside>
  );
}
