import { useTranslation } from "react-i18next";
import {
  IconDownload,
  IconInfoCircle,
  IconLink,
  IconLogout,
  IconMenu2,
  IconMoon,
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
  activeSpeed: string;
  tdlVersion?: string;
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
  activeSpeed,
  tdlVersion,
  accountName,
  accountInitials,
  accountColor,
  loading,
  failed,
}: SidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="sidebar" aria-label={t("sidebar.chats")}>
      <div className="sidebar-header">
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="icon-button"
              aria-label={t("sidebar.menu")}
            >
              <IconMenu2 size={22} stroke={1.8} />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>tgdesk</MenuLabel>
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
          {query && (
            <button
              type="button"
              className="grid place-items-center rounded-full p-0.5 text-[var(--tg-secondary)] hover:bg-black/5"
              onClick={() => onQueryChange("")}
              aria-label={t("sidebar.clearSearch")}
            >
              <IconX size={15} />
            </button>
          )}
        </div>

        <IconButton
          label={t("sidebar.pasteLink")}
          onClick={() => onToast(t("sidebar.pasteLinkToast"))}
        >
          <IconLink size={21} stroke={1.8} />
        </IconButton>
      </div>

      <div className="sidebar-scroll">
        <button
          type="button"
          className="downloads-row"
          data-active={view === "downloads"}
          onClick={onSelectDownloads}
        >
          <span className="downloads-tile">
            <IconDownload size={25} stroke={1.8} />
          </span>
          <span className="downloads-main">
            <span className="downloads-title">
              <span>{t("sidebar.downloads")}</span>
              {activeDownloads > 0 && (
                <span className="downloads-badge">{activeDownloads}</span>
              )}
            </span>
            <span className="downloads-subtitle">
              {activeDownloads > 0
                ? t("sidebar.activeSummary", {
                    count: activeDownloads,
                    speed: activeSpeed,
                  })
                : t("sidebar.noActive")}
            </span>
          </span>
        </button>

        <div className="sidebar-label">{t("sidebar.chats")}</div>

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

          {chats.length === 0 && (
            <div className="px-5 py-8 text-center text-[12.5px] text-[var(--tg-secondary)]">
              {loading
                ? t("chat.loadingChats")
                : failed
                  ? t("chat.loadChatsFailed")
                  : query
                    ? t("sidebar.noMatches", { query })
                    : t("chat.noChats")}
            </div>
          )}
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
            {tdlVersion
              ? t("sidebar.tdlVersion", { version: tdlVersion })
              : t("sidebar.kernel")}
          </div>
        </div>
        <IconButton
          label={theme === "dark" ? t("login.themeLight") : t("login.themeDark")}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
        </IconButton>
        <IconButton label={t("common.settings")} onClick={onSettings}>
          <IconSettings size={20} />
        </IconButton>
      </div>
    </aside>
  );
}
