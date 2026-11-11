import { useTranslation } from "react-i18next";
import {
  IconAddressBook,
  IconBookmark,
  IconBroadcast,
  IconDownload,
  IconInfoCircle,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconMoodSmile,
  IconPencil,
  IconPhone,
  IconSearch,
  IconSettings,
  IconSun,
  IconUserCircle,
  IconUsersPlus,
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
  accountRestricted,
  accountRestriction,
  loading,
  failed,
}: SidebarProps) {
  const { t } = useTranslation();
  const visibleChats = chats;
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
            <MenuLabel>Telegram Desktop</MenuLabel>
            <MenuItem
              icon={<IconMoodSmile size={16} />}
              onSelect={() => onToast(t("sidebar.emojiStatusSoon"))}
            >
              {t("sidebar.setEmojiStatus")}
            </MenuItem>
            <MenuItem
              icon={<IconUserCircle size={16} />}
              onSelect={() => onToast(t("sidebar.profileSoon"))}
            >
              {t("sidebar.myProfile")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<IconUsersPlus size={16} />}
              onSelect={() => onToast(t("sidebar.newGroupSoon"))}
            >
              {t("sidebar.newGroup")}
            </MenuItem>
            <MenuItem
              icon={<IconBroadcast size={16} />}
              onSelect={() => onToast(t("sidebar.newChannelSoon"))}
            >
              {t("sidebar.newChannel")}
            </MenuItem>
            <MenuItem
              icon={<IconAddressBook size={16} />}
              onSelect={() => onToast(t("sidebar.contactsSoon"))}
            >
              {t("sidebar.contacts")}
            </MenuItem>
            <MenuItem
              icon={<IconPhone size={16} />}
              onSelect={() => onToast(t("sidebar.callsSoon"))}
            >
              {t("sidebar.calls")}
            </MenuItem>
            <MenuItem
              icon={<IconBookmark size={16} />}
              onSelect={() => onToast(t("sidebar.savedSoon"))}
            >
              {t("sidebar.savedMessages")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<IconSettings size={16} />} onSelect={onSettings}>
              {t("common.settings")}
            </MenuItem>
            <MenuItem
              icon={theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
              onSelect={onToggleTheme}
            >
              {theme === "dark" ? t("common.lightTheme") : t("common.darkTheme")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<IconDownload size={16} />} onSelect={onSelectDownloads}>
              {t("sidebar.downloads")}
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
