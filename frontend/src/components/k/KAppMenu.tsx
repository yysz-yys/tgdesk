import { cloneElement, isValidElement, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { KIcon } from "./KIcon";

interface KAppMenuProps {
  accountName: string;
  accountInitials?: string;
  accountPhoto?: string;
  accountColor?: string;
  archivedCount: number;
  onSettings?: () => void;
  onArchive: () => void;
  onSaved: () => void;
  onDownloads: () => void;
  onToast: (message: string) => void;
  /** The hamburger button; Radix Themes' Trigger clones it (asChild). */
  trigger: ReactNode;
}

/**
 * Web K's main menu behind the hamburger (tweb sidebarLeft.createToolsMenu):
 * the account row(s), Add Account, Saved Messages, Archived Chats, My Stories,
 * Contacts, Calls, Settings and the More submenu, on tweb's `.btn-menu` plate
 * with a 0.2s scale/fade.
 */
export function KAppMenu({
  accountName,
  accountInitials,
  accountPhoto,
  accountColor,
  archivedCount,
  onSettings,
  onArchive,
  onSaved,
  onDownloads,
  onToast,
  trigger,
}: KAppMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const soon = () => onToast(t("kMenu.comingSoon"));

  // webk keeps the grey plate on the toggle while its menu is open (`.menu-open`).
  const triggerNode =
    isValidElement(trigger) && trigger.type === "button"
      ? cloneElement(trigger as ReactElement<{ className?: string }>, {
          className: [
            (trigger.props as { className?: string }).className ?? "",
            open ? "menu-open" : "",
          ]
            .filter(Boolean)
            .join(" "),
        })
      : trigger;

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger>{triggerNode}</DropdownMenu.Trigger>
      <DropdownMenu.Content
        className="k-menu k-app-menu"
        side="bottom"
        align="start"
        sideOffset={6}
      >
        <DropdownMenu.Item
          className="btn-menu-item k-menu-account-item"
          onSelect={() => onSettings?.()}
        >
          <span
            className="k-menu-avatar"
            style={accountColor ? { backgroundColor: accountColor } : undefined}
          >
            {accountPhoto ? (
              <img src={accountPhoto} alt="" draggable={false} />
            ) : (
              (accountInitials || accountName.slice(0, 1)).toUpperCase()
            )}
          </span>
          <span className="btn-menu-item-text">{accountName}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className="btn-menu-item"
          onSelect={() => soon()}
        >
          <KIcon name="plus" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.addAccount")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="k-menu-separator" />
        <DropdownMenu.Item className="btn-menu-item" onSelect={() => onSaved()}>
          <KIcon name="savedmessages" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.savedMessages")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className="btn-menu-item"
          onSelect={() => onArchive()}
        >
          <KIcon name="archive" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.archivedChats")}</span>
          {archivedCount > 0 ? (
            <span className="k-menu-item-count">
              {archivedCount > 99 ? "99+" : archivedCount}
            </span>
          ) : null}
        </DropdownMenu.Item>
        <DropdownMenu.Item className="btn-menu-item" onSelect={() => soon()}>
          <KIcon name="stories" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.myStories")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item className="btn-menu-item" onSelect={() => soon()}>
          <KIcon name="user" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.contacts")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item className="btn-menu-item" onSelect={() => soon()}>
          <KIcon name="phone" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.calls")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="k-menu-separator" />
        <DropdownMenu.Item
          className="btn-menu-item"
          onSelect={() => onSettings?.()}
        >
          <KIcon name="settings" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.settings")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger className="btn-menu-item">
            <KIcon name="more" className="btn-menu-item-icon" />
            <span className="btn-menu-item-text">{t("kMenu.more")}</span>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent className="k-menu" sideOffset={4}>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => onDownloads()}
            >
              <KIcon name="download" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">
                {t("kMenu.downloads")}
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => soon()}
            >
              <KIcon name="darkmode_filled" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">{t("kMenu.nightMode")}</span>
            </DropdownMenu.Item>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
