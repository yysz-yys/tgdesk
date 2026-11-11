import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IconDownload,
  IconInfoCircle,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconPencil,
  IconSearch,
  IconSettings,
  IconSun,
  IconX,
} from "@tabler/icons-react";
import type { Chat, ResolvedTheme } from "../../types";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "../ui/Menu";
import { ChatRow } from "../chat/ChatRow";
import { FolderTabs, type ChatFolder } from "./FolderTabs";
import "./sidebar.css";

interface SidebarProps {
  chats: Chat[];
  selectedChatId: string;
  view: "chats" | "downloads";
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChat: (id: string) => void;
  onOpenChats: () => void;
  onSelectDownloads: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDownloadAll: (chat: Chat) => void;
  theme: ResolvedTheme;
  onToggleTheme: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onAbout: () => void;
  onToast: (message: string) => void;
  activeDownloads: number;
  accountName: string;
  accountInitials: string;
  accountColor: string;
  loading?: boolean;
  failed?: boolean;
}

export function Sidebar({
  chats,
  selectedChatId,
  view,
  query,
  onQueryChange,
  onSelectChat,
  onOpenChats,
  onSelectDownloads,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onDownloadAll,
  theme,
  onToggleTheme,
  onSettings,
  onLogout,
  onAbout,
  onToast,
  activeDownloads,
  accountName,
  accountInitials,
  accountColor,
  loading,
  failed,
}: SidebarProps) {
  const { t } = useTranslation();
  const [folder, setFolder] = useState<ChatFolder>("all");

  const counts: Record<ChatFolder, number> = {
    all: chats.length,
    unread: chats.filter((chat) => Boolean(chat.unread)).length,
    groups: chats.filter((chat) => chat.kind === "group").length,
    channels: chats.filter((chat) => chat.kind === "channel").length,
  };

  const visibleChats = chats.filter((chat) => {
    switch (folder) {
      case "unread":
        return Boolean(chat.unread);
      case "groups":
        return chat.kind === "group";
      case "channels":
        return chat.kind === "channel";
      default:
        return true;
    }
  });

  const changeFolder = (next: ChatFolder) => {
    setFolder(next);
    onOpenChats();
  };

  const emptyText = loading
    ? t("chat.loadingChats")
    : failed
      ? t("chat.loadChatsFailed")
      : query
        ? t("sidebar.noMatches", { query })
        : folder === "all"
          ? t("chat.noChats")
          : t("sidebar.noFolderChats");

  return (
    <aside className="sidebar" aria-label={t("sidebar.chats")}>
      <div className="sidebar-header">
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="icon-button" aria-label={t("sidebar.menu")}>
              <IconMenu2 size={22} stroke={1.8} />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Telegram</MenuLabel>
            <MenuItem icon={<IconDownload size={16} />} onSelect={onSelectDownloads}>
              {t("sidebar.downloads")}
            </MenuItem>
            <MenuItem
              icon={theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
              onSelect={onToggleTheme}
            >
              {theme === "dark" ? t("common.lightTheme") : t("common.darkTheme")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<IconSettings size={16} />} onSelect={onSettings}>
              {t("common.settings")}
            </MenuItem>
            <MenuItem icon={<IconInfoCircle size={16} />} onSelect={onAbout}>
              {t("common.about")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<IconLogout size={16} />} onSelect={onLogout} danger>
              {t("common.logOut")}
            </MenuItem>
          </MenuContent>
        </Menu>

        <div className="search-box">
          <IconSearch size={18} stroke={1.8} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            aria-label={t("sidebar.searchChats")}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => onQueryChange("")}
              aria-label={t("sidebar.clearSearch")}
            >
              <IconX size={15} />
            </button>
          ) : null}
        </div>

        {activeDownloads > 0 ? (
          <IconButton
            label={t("sidebar.downloadsWithCount", { count: activeDownloads })}
            onClick={onSelectDownloads}
            className="sidebar-download-indicator"
          >
            <IconDownload size={20} />
            <span className="sidebar-download-dot" />
          </IconButton>
        ) : null}

        <IconButton
          label={t("sidebar.newMessage")}
          onClick={() => onToast(t("sidebar.newMessageSoon"))}
        >
          <IconPencil size={20} stroke={1.8} />
        </IconButton>
      </div>

      <FolderTabs active={folder} counts={counts} onChange={changeFolder} />

      <div className="sidebar-scroll">
        <div className="chat-list">
          {visibleChats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              active={view === "chats" && selectedChatId === chat.id}
              onSelect={onSelectChat}
              onTogglePin={onTogglePin}
              onToggleMute={onToggleMute}
              onMarkRead={onMarkRead}
              onDownloadAll={onDownloadAll}
              onToast={onToast}
            />
          ))}

          {visibleChats.length === 0 ? (
            <div className="sidebar-empty">{emptyText}</div>
          ) : null}
        </div>
      </div>

      <div className="sidebar-footer">
        <Avatar
          title={accountName}
          initials={accountInitials}
          color={accountColor}
          size={34}
        />
        <div className="account-copy">
          <div className="account-name">{accountName}</div>
          <div className="account-status">
            <span className="online-dot" />
            {t("chat.online")}
          </div>
        </div>
        <IconButton label={t("common.settings")} onClick={onSettings}>
          <IconSettings size={20} />
        </IconButton>
      </div>
    </aside>
  );
}
