import { useTranslation } from "react-i18next";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/Menu";

interface NavigationRailProps {
  view: "chats" | "downloads";
  activeDownloads: number;
  onChats: () => void;
  onDownloads: () => void;
  onSettings: () => void;
  onLogout: () => void;
  accountName: string;
  accountInitials: string;
  accountColor: string;
  accountRestricted?: boolean;
}

export function NavigationRail({
  view,
  activeDownloads,
  onChats,
  onDownloads,
  onSettings,
  onLogout,
  accountName,
  accountInitials,
  accountColor,
  accountRestricted,
}: NavigationRailProps) {
  const { t } = useTranslation();

  return (
    <nav className="g-rail" aria-label={t("common.mainNavigation")}>
      <div className="g-rail-brand" aria-hidden="true">
        <img src="/brand-192.png" alt="" width={36} height={36} draggable={false} />
      </div>

      <div className="g-rail-destinations">
        <button
          type="button"
          className="g-rail-item"
          data-active={view === "chats" || undefined}
          aria-current={view === "chats" ? "page" : undefined}
          onClick={onChats}
        >
          <span className="g-rail-indicator">
            <Icon name="chat_bubble" size={22} filled={view === "chats"} />
          </span>
          <span className="g-rail-label">{t("sidebar.chats")}</span>
        </button>

        <button
          type="button"
          className="g-rail-item"
          data-active={view === "downloads" || undefined}
          aria-current={view === "downloads" ? "page" : undefined}
          onClick={onDownloads}
        >
          <span className="g-rail-indicator">
            <Icon name="download" size={22} filled={view === "downloads"} />
            {activeDownloads > 0 ? (
              <span className="g-rail-badge">{activeDownloads > 9 ? "9+" : activeDownloads}</span>
            ) : null}
          </span>
          <span className="g-rail-label">{t("sidebar.downloads")}</span>
        </button>
      </div>

      <div className="g-rail-footer">
        <IconButton
          label={t("common.settings")}
          icon="settings"
          iconSize={21}
          onClick={onSettings}
        />

        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="g-rail-account" aria-label={accountName}>
              <Avatar
                title={accountName}
                initials={accountInitials}
                color={accountColor}
                size={34}
              />
              {accountRestricted ? (
                <span className="g-rail-account-warning" aria-hidden="true">
                  <Icon name="error" size={14} filled />
                </span>
              ) : null}
            </button>
          </MenuTrigger>
          <MenuContent align="end" side="right">
            <div className="g-account-menu-head">
              <Avatar
                title={accountName}
                initials={accountInitials}
                color={accountColor}
                size={36}
              />
              <div>
                <div className="g-account-menu-name">{accountName}</div>
                <div className="g-account-menu-status">
                  <span className="g-online-dot" />
                  {t("chat.online")}
                </div>
              </div>
            </div>
            <MenuSeparator />
            <MenuItem icon={<Icon name="settings" size={18} />} onSelect={onSettings}>
              {t("common.settings")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Icon name="logout" size={18} />} onSelect={onLogout} danger>
              {t("common.logOut")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </nav>
  );
}
