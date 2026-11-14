import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { UserStatusKind } from "../../types";
import { Avatar, Icon, IconButton } from "../../ui";
// The two-line account row is styled next to the profile/home dialog it opens.
import "../settings/profile-home.css";

interface AppMenuProps {
  view: "chats" | "downloads";
  activeDownloads: number;
  accountName: string;
  accountInitials?: string;
  accountColor?: string;
  accountPhoto?: string;
  /** Opens the Telegram-style profile/home dialog owned by the shell. */
  onProfile?: () => void;
  accountUsername?: string;
  accountPhone?: string;
  accountStatus?: UserStatusKind;
  onChats: () => void;
  onArchive: () => void;
  archivedCount: number;
  onDownloads: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

/** Shared app navigation dropdown used by the chat sidebar and downloads page. */
export function AppMenu({
  view,
  activeDownloads,
  accountName,
  accountInitials,
  accountColor,
  accountPhoto,
  onProfile,
  accountUsername,
  accountPhone,
  accountStatus = "online",
  onChats,
  onArchive,
  archivedCount,
  onDownloads,
  onSettings,
  onLogout,
}: AppMenuProps) {
  const { t } = useTranslation();
  // Telegram's menu header shows the account name and, on the second line, the
  // @username; a phone-only account falls back to the number.
  const handle = accountUsername?.replace(/^@+/, "").trim();
  const accountSub = handle ? `@${handle}` : accountPhone || undefined;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <IconButton
          label={t("common.mainNavigation")}
          icon="menu"
          size="2"
          iconSize={18}
          tooltip={false}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="start"
        side="bottom"
        sideOffset={6}
        className="f-app-menu f-menu-content"
      >
        {/* The account header doubles as the entry point to the profile/settings
            home; Telegram opens Settings from the same row. */}
        <DropdownMenu.Item
          className="f-menu-row f-app-menu-account f-app-menu-account-button"
          onSelect={() => onProfile?.()}
        >
          <Avatar
            title={accountName}
            initials={accountInitials ?? accountName.slice(0, 1)}
            color={accountColor ?? "var(--accent-9)"}
            photo={accountPhoto}
            size={26}
            online={accountStatus === "online"}
          />
          <span className="f-profile-menu-copy">
            <span className="f-profile-menu-name" dir="auto">
              {accountName}
            </span>
            {accountSub ? (
              <span className="f-profile-menu-sub" dir="ltr">
                {accountSub}
              </span>
            ) : null}
          </span>
          <Icon name="chevron_right" size={14} className="f-profile-menu-chevron" />
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item className="f-menu-row" onSelect={onChats}>
          <Icon name="chat_bubble" size={15} />
          <span className="f-menu-label">{t("sidebar.chats")}</span>
          {view === "chats" ? (
            <Icon name="check" size={14} className="f-app-menu-check" />
          ) : null}
        </DropdownMenu.Item>
        <DropdownMenu.Item className="f-menu-row" onSelect={onDownloads}>
          <Icon name="download" size={15} />
          <span className="f-menu-label">{t("sidebar.downloads")}</span>
          {activeDownloads > 0 ? (
            <span className="f-app-menu-count">
              {activeDownloads > 99 ? "99+" : activeDownloads}
            </span>
          ) : null}
          {view === "downloads" ? (
            <Icon name="check" size={14} className="f-app-menu-check" />
          ) : null}
        </DropdownMenu.Item>
        {archivedCount > 0 ? (
          <DropdownMenu.Item className="f-menu-row" onSelect={onArchive}>
            <Icon name="archive" size={15} />
            <span className="f-menu-label">{t("sidebar.archiveTitle")}</span>
            <span className="f-app-menu-count f-app-menu-count-neutral">
              {archivedCount > 99 ? "99+" : archivedCount}
            </span>
          </DropdownMenu.Item>
        ) : null}
        <DropdownMenu.Separator />
        <DropdownMenu.Item className="f-menu-row" onSelect={onSettings}>
          <Icon name="settings" size={15} />
          <span>{t("common.settings")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className="f-menu-row"
          color="red"
          onSelect={onLogout}
        >
          <Icon name="logout" size={15} />
          <span>{t("common.logOut")}</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
