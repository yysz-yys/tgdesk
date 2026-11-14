import { useState, type CSSProperties } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { KIcon } from "./KIcon";
import type { KIconName } from "./icons";
import { KScrollArea } from "./KScrollArea";
import { KSuperTabHeader } from "./KSuperTab";
import { rowIconBackground } from "./rowIcons";

/** The reference client this UI is ported from (the Settings footer line). */
export const WEBK_VERSION = "Telegram WebK 2.3 (687)";

export interface KSettingsProps {
  name: string;
  initials: string;
  /** Web K peer-colour gradient used behind the initials when there is no photo. */
  avatarBackground: string;
  photo?: string;
  phone?: string;
  username?: string;
  /** Localized name of the current UI language (the Language row's right text). */
  languageLabel: string;
  /** Number of active Telegram sessions, when the kernel has answered. */
  deviceCount?: number;
  backLabel: string;
  onBack: () => void;
  /** Opens the existing settings screen (data storage / general settings). */
  onOpenLegacySettings: () => void;
  onLogOut: () => void;
  onOpenQrCode: () => void;
  onToast: (message: string) => void;
  onOpenUrl: (url: string) => void;
}

type SectionAction =
  | "notifications"
  | "data"
  | "privacy"
  | "general"
  | "folders"
  | "stickers"
  | "speakers"
  | "devices"
  | "language"
  | "shortcuts"
  | "premium"
  | "business"
  | "gift"
  | "faq"
  | "ask";

interface SettingsRowConfig {
  id: SectionAction;
  icon: KIconName;
  labelKey: string;
  /** Localized value shown at the end of the row (language, device count). */
  right?: string;
}

/**
 * Web K's Settings home (tweb components/sidebarLeft/tabs/settings.tsx +
 * peerProfile.tsx): the self profile header, the phone row, the settings
 * sections, the premium/business/gift block, the help block and the version
 * line. Sections that this build cannot really show announce themselves with a
 * localized explanation instead of pretending to work.
 */
export function KSettings({
  name,
  initials,
  avatarBackground,
  photo,
  phone,
  username,
  languageLabel,
  deviceCount,
  backLabel,
  onBack,
  onOpenLegacySettings,
  onLogOut,
  onOpenQrCode,
  onToast,
  onOpenUrl,
}: KSettingsProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const soon = () => onToast(t("kSettings.comingSoon"));

  const copyPhone = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      onToast(t("kSettings.phoneCopied"));
    } catch {
      onToast(t("kSettings.copyFailed"));
    }
  };

  const mainRows: SettingsRowConfig[] = [
    { id: "notifications", icon: "bell_filled", labelKey: "kSettings.notifications" },
    { id: "data", icon: "data_filled", labelKey: "kSettings.dataAndStorage" },
    { id: "privacy", icon: "key_filled", labelKey: "kSettings.privacyAndSecurity" },
    { id: "general", icon: "general_filled", labelKey: "kSettings.generalSettings" },
    { id: "folders", icon: "limit_folders_filled", labelKey: "kSettings.chatFolders" },
    { id: "stickers", icon: "reactions_filled", labelKey: "kSettings.stickersAndEmoji" },
    { id: "speakers", icon: "speaker_filled", labelKey: "kSettings.speakersAndCamera" },
    {
      id: "devices",
      icon: "devices_filled",
      labelKey: "kSettings.devices",
      right:
        typeof deviceCount === "number" && deviceCount > 0
          ? String(deviceCount)
          : undefined,
    },
    {
      id: "language",
      icon: "web_filled",
      labelKey: "kSettings.language",
      right: languageLabel,
    },
    { id: "shortcuts", icon: "keyboard_filled", labelKey: "kSettings.keyboardShortcuts" },
  ];

  const telegramRows: SettingsRowConfig[] = [
    { id: "premium", icon: "premium_badge", labelKey: "kSettings.telegramPremium" },
    { id: "business", icon: "business_filled", labelKey: "kSettings.telegramBusiness" },
    { id: "gift", icon: "gift_filled", labelKey: "kSettings.sendGift" },
  ];

  const helpRows: SettingsRowConfig[] = [
    { id: "faq", icon: "faq_filled", labelKey: "kSettings.telegramFaq" },
    { id: "ask", icon: "message_filled", labelKey: "kSettings.askQuestion" },
  ];

  const openRow = (id: SectionAction) => {
    switch (id) {
      case "data":
      case "general":
      case "language":
        onOpenLegacySettings();
        return;
      case "faq":
        onOpenUrl("https://telegram.org/faq#general-questions");
        return;
      case "ask":
        onOpenUrl("https://telegram.org/faq#general-questions");
        return;
      default:
        soon();
    }
  };

  const renderRow = (row: SettingsRowConfig) => (
    <button
      key={row.id}
      type="button"
      className="k-row k-row-clickable"
      onClick={() => openRow(row.id)}
    >
      <span
        className="k-row-icon"
        style={
          { "--row-icon-background": rowIconBackground(row.icon) } as CSSProperties
        }
        aria-hidden="true"
      >
        <KIcon name={row.icon} />
      </span>
      <span className="k-row-texts">
        <span className="k-row-title">{t(row.labelKey)}</span>
      </span>
      {row.right ? <span className="k-row-right">{row.right}</span> : null}
    </button>
  );

  return (
    <div className="k-page k-settings-page">
      <KSuperTabHeader title={t("kSettings.title")} onBack={onBack} backLabel={backLabel}>
        <button
          type="button"
          className="btn-icon k-settings-header-button"
          aria-label={t("kSettings.search")}
          onClick={() => onToast(t("kSettings.searchSoon"))}
        >
          <KIcon name="search" className="button-icon" />
        </button>
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger>
            <button
              type="button"
              className="btn-icon k-settings-header-button"
              aria-label={t("kSettings.more")}
            >
              <KIcon name="more" className="button-icon" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content className="k-menu k-settings-menu" side="bottom" align="end" sideOffset={6}>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => onToast(t("kSettings.editSoon"))}
            >
              <KIcon name="edit" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">{t("kSettings.editProfile")}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="btn-menu-item"
              onSelect={() => (username ? onOpenQrCode() : soon())}
            >
              <KIcon name="qr" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">{t("kSettings.qrCode")}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="k-menu-separator" />
            <DropdownMenu.Item className="btn-menu-item is-danger" onSelect={onLogOut}>
              <KIcon name="logout" className="btn-menu-item-icon" />
              <span className="btn-menu-item-text">{t("kSettings.logOut")}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </KSuperTabHeader>

      <div className="k-super-tab-content">
        <KScrollArea className="k-settings-scroll">
          <div className="k-settings-profile">
            <div
              className="k-settings-avatar"
              style={{ background: avatarBackground }}
              aria-hidden="true"
            >
              {photo ? (
                <img src={photo} alt="" draggable={false} decoding="async" />
              ) : (
                initials
              )}
            </div>
            <div className="k-settings-name" dir="auto">
              {name}
            </div>
            <div className="k-settings-status">{t("kSettings.online")}</div>
          </div>

          {phone ? (
            <div className="k-section-container k-settings-phone-container">
              <div className="k-section">
                <button
                  type="button"
                  className="k-row k-row-clickable k-settings-phone-row"
                  onClick={() => void copyPhone()}
                >
                  <span
                    className="k-row-icon"
                    style={{ "--row-icon-background": rowIconBackground("phone_filled") } as CSSProperties}
                    aria-hidden="true"
                  >
                    <KIcon name="phone_filled" />
                  </span>
                  <span className="k-row-texts">
                    <span className="k-row-title" dir="ltr">
                      {phone}
                    </span>
                    <span className="k-row-subtitle">{t("kSettings.phone")}</span>
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          <div className="k-section-container">
            <div className="k-section">{mainRows.map(renderRow)}</div>
          </div>

          <div className="k-section-container">
            <div className="k-section">{telegramRows.map(renderRow)}</div>
          </div>

          <div className="k-section-container">
            <div className="k-section">{helpRows.map(renderRow)}</div>
          </div>

          <div className="k-settings-version" aria-hidden="true">
            {WEBK_VERSION}
          </div>
        </KScrollArea>
      </div>
    </div>
  );
}
