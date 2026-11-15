import { cloneElement, isValidElement, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { KIcon } from "./KIcon";
import { WEBK_VERSION } from "./KSettings";

/** The More submenu's entries that hand the action to the app shell. */
export type KAppMenuMoreAction =
  | "switch-to-a"
  | "features"
  | "report-bug"
  | "install"
  | "pip";

interface KAppMenuProps {
  accountName: string;
  accountInitials?: string;
  accountPhoto?: string;
  /** CSS background value for the letter avatar when there is no photo (Web K peer gradient). */
  accountAvatarBackground?: string;
  archivedCount: number;
  nightMode: boolean;
  onToggleNightMode: (point?: { x: number; y: number }) => void;
  /** 2 full, 1 reduced, 0 off (tweb liteMode.getAnimationLevel). */
  animationLevel: number;
  onCycleAnimations: () => void;
  onSettings?: () => void;
  onArchive: () => void;
  onSaved: () => void;
  onDownloads: () => void;
  onMoreAction: (action: KAppMenuMoreAction) => void;
  onToast: (message: string) => void;
  /** The hamburger button; Radix Themes' Trigger clones it (asChild). */
  trigger: ReactNode;
}

/**
 * Web K's main menu behind the hamburger (tweb sidebarLeft.createToolsMenu):
 * the account row(s), Add Account, Saved Messages, Archived Chats, My Stories,
 * Contacts, Calls, Settings, Downloads and the More submenu on tweb's
 * `.btn-menu` plate with a 0.2s scale/fade. The More submenu
 * (createMoreSubmenu) opens on hover to the right, like tweb's
 * `createSubmenuTrigger({direction: 'right-start'})` + `.sidebar-tools-submenu`,
 * and ends with the muted version line.
 */
export function KAppMenu({
  accountName,
  accountInitials,
  accountPhoto,
  accountAvatarBackground,
  archivedCount,
  nightMode,
  onToggleNightMode,
  animationLevel,
  onCycleAnimations,
  onSettings,
  onArchive,
  onSaved,
  onDownloads,
  onMoreAction,
  onToast,
  trigger,
}: KAppMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const soon = () => onToast(t("kMenu.comingSoon"));

  // The animations entry names what its click does (tweb animationsToggleTexts).
  const animationsLabel =
    animationLevel >= 2
      ? t("kMenu.reduceAnimations")
      : animationLevel === 1
        ? t("kMenu.disableAnimations")
        : t("kMenu.enableAnimations");

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
            style={{ background: accountAvatarBackground }}
          >
            {accountPhoto ? (
              <img src={accountPhoto} alt="" draggable={false} />
            ) : (
              (accountInitials || accountName.slice(0, 1)).toUpperCase()
            )}
          </span>
          <span className="btn-menu-item-text">{accountName}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item className="btn-menu-item" onSelect={() => soon()}>
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
        <DropdownMenu.Item
          className="btn-menu-item"
          onSelect={() => onDownloads()}
        >
          <KIcon name="download" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.downloads")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger className="btn-menu-item k-menu-submenu-trigger">
            <KIcon name="more" className="btn-menu-item-icon" />
            <span className="btn-menu-item-text">{t("kMenu.more")}</span>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent
            className="k-menu k-app-submenu"
            // Radix opens a submenu on the inline end by itself (`side="right"`
            // in LTR, "left" in RTL); passing `side` is a type error there.
            align="start"
            sideOffset={4}
          >
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={(event) => {
                const rect = (event.target as HTMLElement)?.getBoundingClientRect?.();
                onToggleNightMode(
                  rect
                    ? {
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                      }
                    : undefined,
                );
              }}
            >
              <KIcon name="darkmode" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">
                {nightMode
                  ? t("kMenu.disableDarkMode")
                  : t("kMenu.enableDarkMode")}
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="btn-menu-item"
              // tweb keeps the animations entry open, the next level a click away.
              onSelect={(event) => {
                event.preventDefault();
                onCycleAnimations();
              }}
            >
              <KIcon name="animations" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">{animationsLabel}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => onMoreAction("switch-to-a")}
            >
              <KIcon name="aversion" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">{t("kMenu.switchToA")}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => onMoreAction("features")}
            >
              <KIcon name="help" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">
                {t("kMenu.telegramFeatures")}
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => onMoreAction("report-bug")}
            >
              <KIcon name="bug" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">{t("kMenu.reportBug")}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => onMoreAction("install")}
            >
              <KIcon name="plusround" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">{t("kMenu.installApp")}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => onMoreAction("pip")}
            >
              <KIcon name="pip" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">
                {t("kMenu.pictureInPicture")}
              </span>
            </DropdownMenu.Item>
            <div className="k-menu-version">{WEBK_VERSION}</div>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
