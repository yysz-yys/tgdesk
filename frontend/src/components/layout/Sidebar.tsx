import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { Chat, ChatFolder } from "../../types";
import { chatMatchesFolder } from "../../data/folders";
import {
  EmptyState,
  Icon,
  IconButton,
  TextField,
} from "../../ui";
import { ChatRow } from "../chat/ChatRow";
import { AppMenu } from "./AppMenu";

interface SidebarProps {
  activeView: "chats" | "downloads";
  chats: Chat[];
  selectedChatId: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChat: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDownloadAll: (chat: Chat) => void;
  onToggleArchive: (chat: Chat) => void;
  onToast: (message: string) => void;
  onChats: () => void;
  onDownloads: () => void;
  onSettings: () => void;
  onLogout: () => void;
  activeDownloads: number;
  folders: ChatFolder[];
  archivedCount: number;
  accountRestricted?: boolean;
  accountRestriction?: string;
  accountName?: string;
  accountInitials?: string;
  accountColor?: string;
  accountPhoto?: string;
  loading?: boolean;
  failed?: boolean;
}

export function Sidebar({
  activeView,
  chats,
  selectedChatId,
  query,
  onQueryChange,
  onSelectChat,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onMarkAllRead,
  onDownloadAll,
  onToggleArchive,
  onToast,
  onChats,
  onDownloads,
  onSettings,
  onLogout,
  activeDownloads,
  folders,
  archivedCount,
  accountRestricted,
  accountRestriction,
  accountName,
  accountInitials,
  accountColor,
  accountPhoto,
  loading,
  failed,
}: SidebarProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearchOpen, setArchiveSearchOpen] = useState(false);
  const [hideArchived, setHideArchived] = useState(
    () => window.localStorage.getItem("tgdesk.sidebar.hideArchived") === "1",
  );
  const archiveSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (folders.length === 0 && filter !== "all") {
      setFilter("all");
    }
  }, [folders.length, filter]);
  const normalChats = chats.filter((chat) => !chat.archived);
  const archivedChats = chats.filter((chat) => chat.archived);
  const showingArchive = archiveOpen && archivedCount > 0;
  const selectedFolder = filter.startsWith("folder:")
    ? folders.find((folder) => `folder:${folder.id}` === filter)
    : undefined;

  const chatsForFilter = (value: string) => {
    const folder = value.startsWith("folder:")
      ? folders.find((item) => `folder:${item.id}` === value)
      : undefined;
    if (folder) {
      return normalChats.filter((chat) => chatMatchesFolder(folder, chat));
    }
    return normalChats;
  };
  const changeFilter = (value: string) => {
    onChats();
    setFilter(value);
    const next = chatsForFilter(value);
    if (next.length > 0 && !next.some((chat) => chat.id === selectedChatId)) {
      onSelectChat(next[0].id);
    }
  };
  const visibleChats = chatsForFilter(filter);
  const needle = query.trim().toLowerCase();
  const archiveChats = needle
    ? archivedChats.filter((chat) =>
        `${chat.title} ${chat.username ?? ""} ${chat.preview}`
          .toLowerCase()
          .includes(needle),
      )
    : archivedChats;
  const archivePreview = archivedChats
    .slice(0, 2)
    .map((chat) => chat.title)
    .join("、");
  const emptyText = failed
    ? t("chat.loadChatsFailed")
    : query
      ? t("sidebar.noMatches", { query })
      : selectedFolder
        ? t("sidebar.emptyFolder")
        : t("chat.noChats");
  const emptyIcon = query
    ? "search_off"
    : selectedFolder
      ? "folder"
      : failed
        ? "cloud_off"
        : "forum";
  const filterItems = [
    { value: "all", label: t("sidebar.all"), count: normalChats.length },
    ...folders.map((folder) => ({
      value: `folder:${folder.id}`,
      label: `${folder.emoticon ? `${folder.emoticon} ` : ""}${folder.title}`,
      count: normalChats.filter((chat) => chatMatchesFolder(folder, chat)).length,
    })),
  ];

  const openArchive = () => {
    onChats();
    setArchiveOpen(true);
    setArchiveSearchOpen(false);
    onQueryChange("");
  };
  const closeArchive = () => {
    setArchiveOpen(false);
    setArchiveSearchOpen(false);
    onQueryChange("");
  };
  const openArchiveSearch = () => {
    setArchiveSearchOpen(true);
  };
  const closeArchiveSearch = () => {
    setArchiveSearchOpen(false);
    onQueryChange("");
  };

  useEffect(() => {
    if (!archiveSearchOpen) {
      return;
    }
    // Radix restores focus to the menu trigger after onSelect; focus the input
    // on the next task so that restoration cannot steal it back.
    const timer = window.setTimeout(() => {
      archiveSearchRef.current?.querySelector("input")?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [archiveSearchOpen]);
  const toggleArchiveVisibility = () => {
    const next = !hideArchived;
    setHideArchived(next);
    window.localStorage.setItem(
      "tgdesk.sidebar.hideArchived",
      next ? "1" : "0",
    );
    if (next) {
      closeArchive();
    }
  };
  const changeQuery = (value: string) => {
    onChats();
    onQueryChange(value);
  };

  return (
    <aside className="f-sidebar" aria-label={t("sidebar.chats")}>
      {showingArchive ? (
        <div className="f-archive-head">
          <IconButton
            label={t("sidebar.backToChats")}
            icon="arrow_back"
            size="2"
            iconSize={18}
            onClick={closeArchive}
          />
          {archiveSearchOpen ? (
            <div className="f-archive-head-search" ref={archiveSearchRef}>
              <TextField
                size="1"
                value={query}
                onValueChange={changeQuery}
                placeholder={t("sidebar.searchArchived")}
                aria-label={t("sidebar.searchArchived")}
                leadingIcon="search"
              />
            </div>
          ) : (
            <span className="f-archive-title">{t("sidebar.archiveTitle")}</span>
          )}
          {archiveSearchOpen ? (
            <IconButton
              label={t("sidebar.closeSearch")}
              icon="close"
              size="2"
              iconSize={18}
              onClick={closeArchiveSearch}
            />
          ) : (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <IconButton
                label={t("sidebar.archiveMenu")}
                icon="more_vert"
                size="2"
                iconSize={18}
                tooltip={false}
              />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="f-menu-content"
            >
              <DropdownMenu.Item
                className="f-menu-row"
                onSelect={openArchiveSearch}
              >
                <Icon name="search" size={15} />
                <span>{t("sidebar.searchPlaceholder")}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="f-menu-row"
                onSelect={toggleArchiveVisibility}
              >
                <Icon name={hideArchived ? "unarchive" : "archive"} size={15} />
                <span>
                  {hideArchived
                    ? t("sidebar.showInChatList")
                    : t("sidebar.hideFromChatList")}
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="f-menu-row"
                onSelect={() => onMarkAllRead()}
              >
                <Icon name="mark_email_read" size={15} />
                <span>{t("sidebar.markAllRead")}</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          )}
        </div>
      ) : (
        <div className="f-sidebar-head">
          <AppMenu
            view={activeView}
            activeDownloads={activeDownloads}
            accountName={accountName ?? ""}
            accountInitials={accountInitials}
            accountColor={accountColor}
            accountPhoto={accountPhoto}
            onChats={onChats}
            onArchive={openArchive}
            archivedCount={archivedChats.length}
            onDownloads={onDownloads}
            onSettings={onSettings}
            onLogout={onLogout}
          />
          <div className="f-sidebar-search">
            <TextField
              size="2"
              value={query}
              onValueChange={changeQuery}
              placeholder={t("sidebar.searchPlaceholder")}
              aria-label={t("sidebar.searchChats")}
              leadingIcon="search"
              trailing={
                query ? (
                  <IconButton
                    label={t("sidebar.clearSearch")}
                    icon="close"
                    size="1"
                    tooltip={false}
                    onClick={() => changeQuery("")}
                  />
                ) : undefined
              }
            />
          </div>
        </div>
      )}

      {showingArchive ? null : (
        <div className="f-filter-bar">
          {folders.length === 0 ? (
            <span className="f-filter-static" aria-label={t("sidebar.chats")}>
              <span>{t("sidebar.all")}</span>
              <b>{normalChats.length}</b>
            </span>
          ) : (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <button
                  type="button"
                  className="f-filter-trigger"
                  aria-label={t("sidebar.chats")}
                >
                  <span>{filterItems.find((item) => item.value === filter)?.label ?? t("sidebar.all")}</span>
                  <b>{filterItems.find((item) => item.value === filter)?.count ?? normalChats.length}</b>
                  <Icon name="expand_more" size={14} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content
                align="start"
                sideOffset={4}
                className="f-filter-menu"
              >
                {filterItems.map((item) => (
                  <DropdownMenu.Item
                    key={item.value}
                    className="f-filter-item"
                    data-active={item.value === filter || undefined}
                    onSelect={() => changeFilter(item.value)}
                  >
                    <span className="f-filter-label">{item.label}</span>
                    <span className="f-filter-count">{item.count}</span>
                    {item.value === filter ? (
                      <Icon name="check" size={14} className="f-filter-check" />
                    ) : null}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          )}
          <button
            type="button"
            className="f-downloads-shortcut"
            data-active={activeView === "downloads" || undefined}
            onClick={onDownloads}
          >
            <Icon name="download" size={15} />
            <span>{t("sidebar.downloads")}</span>
            {activeDownloads > 0 ? (
              <b>{activeDownloads > 99 ? "99+" : activeDownloads}</b>
            ) : null}
          </button>
        </div>
      )}

      {!showingArchive && accountRestricted ? (
        <button
          type="button"
          className="f-restricted"
          onClick={() => onToast(accountRestriction || t("sidebar.restrictedDetail"))}
        >
          <span className="f-restricted-icon">
            <Icon name="error" size={16} />
          </span>
          <span>
            <strong>{t("sidebar.restricted")}</strong>
            <small>{t("sidebar.restrictedDetails")}</small>
          </span>
        </button>
      ) : null}

      <div className="f-sidebar-scroll">
        {showingArchive ? (
          archiveChats.length > 0 ? (
            <div className="f-rows" aria-label={t("sidebar.archiveTitle")}>
              {archiveChats.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  active={activeView === "chats" && selectedChatId === chat.id}
                  onSelect={onSelectChat}
                  onTogglePin={onTogglePin}
                  onToggleMute={onToggleMute}
                  onMarkRead={onMarkRead}
                  onDownloadAll={onDownloadAll}
                  onToggleArchive={onToggleArchive}
                  onToast={onToast}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={query ? "search_off" : "archive"}
              title={
                query
                  ? t("sidebar.noMatches", { query })
                  : t("sidebar.noArchived")
              }
            />
          )
        ) : loading ? (
          <div className="f-rows" aria-busy="true" aria-label={t("chat.loadingChats")}>
            {Array.from({ length: 9 }).map((_, index) => (
              <div className="f-skeleton-row" key={index} aria-hidden="true">
                <span className="f-skeleton-avatar" />
                <span className="f-skeleton-copy">
                  <span style={{ width: `${48 + ((index * 13) % 30)}%` }} />
                  <span style={{ width: `${70 + ((index * 7) % 24)}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {!query && filter === "all" && !hideArchived && archivedChats.length > 0 ? (
              <button
                type="button"
                className="f-row f-archive-row"
                onClick={openArchive}
                aria-label={t("sidebar.archiveTitle")}
              >
                <span className="g-chat-avatar">
                  <span className="f-avatar f-archive-avatar">
                    <Icon name="archive" size={20} />
                  </span>
                </span>
                <span className="f-row-body">
                  <span className="f-row-top">
                    <span className="f-row-title">{t("sidebar.archiveTitle")}</span>
                  </span>
                  <span className="f-row-bottom">
                    <span className="f-row-preview">{archivePreview}</span>
                    <span
                      className="f-archive-count"
                      style={{ background: "transparent", color: "var(--f-muted)" }}
                    >
                      {archivedChats.length > 99 ? "99+" : archivedChats.length}
                    </span>
                  </span>
                </span>
              </button>
            ) : null}
            {visibleChats.length > 0 ? (
              <div className="f-rows" aria-label={t("sidebar.chats")}>
                {visibleChats.map((chat) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    active={activeView === "chats" && selectedChatId === chat.id}
                    onSelect={onSelectChat}
                    onTogglePin={onTogglePin}
                    onToggleMute={onToggleMute}
                    onMarkRead={onMarkRead}
                    onDownloadAll={onDownloadAll}
                    onToggleArchive={onToggleArchive}
                    onToast={onToast}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={emptyIcon} title={emptyText} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
