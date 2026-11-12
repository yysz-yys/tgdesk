import { useTranslation } from "react-i18next";
import {
  IconDownload,
  IconLogout,
  IconMenu2,
  IconSearch,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import type { Chat } from "../../types";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/Menu";
import { ChatRow } from "../chat/ChatRow";
import "./sidebar.css";

interface SidebarProps {
  chats: Chat[];
  selectedChatId: string;
  view: "chats" | "downloads";
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChat: (id: string) => void;
  onSelectDownloads: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDownloadAll: (chat: Chat) => void;
  onSettings: () => void;
  onLogout: () => void;
  onToast: (message: string) => void;
  accountName: string;
  accountInitials: string;
  accountColor: string;
  accountRestricted?: boolean;
  accountRestriction?: string;
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
  onSelectDownloads,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onDownloadAll,
  onSettings,
  onLogout,
  onToast,
  accountName,
  accountInitials,
  accountColor,
  accountRestricted,
  accountRestriction,
  loading,
  failed,
}: SidebarProps) {
  const { t } = useTranslation();
  const emptyText = loading
    ? t("chat.loadingChats")
    : failed
      ? t("chat.loadChatsFailed")
      : query
        ? t("sidebar.noMatches", { query })
        : t("chat.noChats");

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
            <MenuItem icon={<IconSettings size={16} />} onSelect={onSettings}>
              {t("common.settings")}
            </MenuItem>
            <MenuItem icon={<IconDownload size={16} />} onSelect={onSelectDownloads}>
              {t("sidebar.downloads")}
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
      </div>

      {accountRestricted ? (
        <button
          type="button"
          className="sidebar-warning"
          onClick={() => onToast(accountRestriction || t("sidebar.restrictedDetail"))}
        >
          <span className="sidebar-warning-title">{t("sidebar.restricted")}</span>
          <span className="sidebar-warning-link">{t("sidebar.restrictedDetails")} ›</span>
        </button>
      ) : null}

      <div className="sidebar-scroll">
        <div className="chat-list">
          {chats.map((chat) => (
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

          {chats.length === 0 ? <div className="sidebar-empty">{emptyText}</div> : null}
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
