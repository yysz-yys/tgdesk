import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "../auth/BrandMark";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";

interface NavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

/**
 * Telegram-style left navigation drawer, built with Material surfaces and the
 * shared icon set. It replaces the permanent navigation rail so the main page
 * can follow Telegram Web's two-column layout.
 */
export function NavDrawer({
  open,
  onOpenChange,
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
}: NavDrawerProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="g-drawer-scrim" />
        <Dialog.Content
          ref={contentRef}
          tabIndex={-1}
          className="g-drawer"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus({ preventScroll: true });
          }}
        >
          <header className="g-drawer-header">
            <div className="g-drawer-brand">
              <BrandMark size={28} alt="" />
              <Dialog.Title className="g-drawer-title">tgdesk</Dialog.Title>
            </div>
            <Dialog.Description className="sr-only">
              {t("common.mainNavigation")}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                className="g-drawer-close"
                aria-label={t("rightPanel.close")}
              >
                <Icon name="close" size={20} />
              </button>
            </Dialog.Close>
          </header>

          <div className="g-drawer-account">
            <Avatar
              title={accountName}
              initials={accountInitials}
              color={accountColor}
              size={42}
            />
            <div className="g-drawer-account-copy">
              <span>{accountName}</span>
              <small>{t("chat.online")}</small>
            </div>
            {accountRestricted ? <Icon name="error" size={17} filled /> : null}
          </div>

          <nav className="g-drawer-nav" aria-label={t("common.mainNavigation")}>
            <button
              type="button"
              className="g-drawer-item"
              data-active={view === "chats" || undefined}
              onClick={onChats}
            >
              <Icon name="chat_bubble" size={21} filled={view === "chats"} />
              <span>{t("sidebar.chats")}</span>
            </button>
            <button
              type="button"
              className="g-drawer-item"
              data-active={view === "downloads" || undefined}
              onClick={onDownloads}
            >
              <Icon name="download" size={21} filled={view === "downloads"} />
              <span>{t("sidebar.downloads")}</span>
              {activeDownloads > 0 ? (
                <span className="g-drawer-count">{activeDownloads > 9 ? "9+" : activeDownloads}</span>
              ) : null}
            </button>
          </nav>

          <div className="g-drawer-footer">
            <button type="button" className="g-drawer-item" onClick={onSettings}>
              <Icon name="settings" size={20} />
              <span>{t("common.settings")}</span>
            </button>
            <button type="button" className="g-drawer-item" data-danger onClick={onLogout}>
              <Icon name="logout" size={20} />
              <span>{t("common.logOut")}</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
