import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, Dialog, Icon } from "../../ui";
import "./profile-home.css";

/**
 * Telegram settings sections the profile home can open. `App` maps them onto
 * the settings screen; sections the current build cannot show yet fall back to
 * the coming-soon toast instead.
 */
export type ProfileHomeSection =
  | "notifications"
  | "data"
  | "privacy"
  | "general"
  | "folders"
  | "stickers"
  | "speakers"
  | "language"
  | "about";

interface ProfileHomeRow {
  id: ProfileHomeSection;
  icon: string;
  /** Telegram palette tile behind the glyph. */
  color: string;
  labelKey: string;
  /** The current SettingsDialog can reach this section; others toast. */
  available: boolean;
}

/**
 * Telegram Android's Settings home order (image 4). `available` marks the rows
 * the existing SettingsDialog really renders; the rest announce themselves.
 */
const PROFILE_HOME_ROWS: ProfileHomeRow[] = [
  {
    id: "notifications",
    icon: "notifications",
    color: "#e17076",
    labelKey: "settings.notifications.title",
    available: false,
  },
  {
    id: "data",
    icon: "dns",
    color: "#5fbd5f",
    labelKey: "profileHome.dataAndStorage",
    available: true,
  },
  {
    id: "privacy",
    icon: "key",
    color: "#eaa43b",
    labelKey: "settings.list.privacy",
    available: false,
  },
  {
    id: "general",
    icon: "settings",
    color: "#7d8bf5",
    labelKey: "profileHome.generalSettings",
    available: true,
  },
  {
    id: "folders",
    icon: "folder",
    color: "#64a9e8",
    labelKey: "settings.list.folders",
    available: false,
  },
  {
    id: "stickers",
    icon: "favorite",
    color: "#ee7aae",
    labelKey: "profileHome.stickersAndEmoji",
    available: false,
  },
  {
    id: "speakers",
    icon: "volume_up",
    color: "#9b8cf0",
    labelKey: "settings.list.speakers",
    available: false,
  },
  {
    id: "language",
    icon: "public",
    color: "#56b8c8",
    labelKey: "settings.list.language",
    available: true,
  },
  {
    id: "about",
    icon: "info",
    color: "#8f98a3",
    labelKey: "common.about",
    available: false,
  },
];

export interface ProfileHomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  initials: string;
  color: string;
  photo?: string;
  username?: string;
  phone?: string;
  /** Self profile: Telegram shows the account as online. */
  online?: boolean;
  onOpenSettings: (section: string) => void;
  onToast?: (message: string) => void;
  onLogout?: () => void;
  /** Optional edit-profile flow; the dialog shows a hint when it is missing. */
  onEditProfile?: () => void;
}

/**
 * Telegram-style profile/settings home opened from the app-menu account row:
 * large avatar, name, presence, phone and the settings sections (image 4).
 */
export function ProfileHomeDialog({
  open,
  onOpenChange,
  name,
  initials,
  color,
  photo,
  username,
  phone,
  online = true,
  onOpenSettings,
  onToast,
  onLogout,
  onEditProfile,
}: ProfileHomeDialogProps) {
  const { t } = useTranslation();
  const handle = username?.replace(/^@+/, "").trim();

  const closeThen = (action?: () => void) => {
    onOpenChange(false);
    action?.();
  };

  const editProfile = () => {
    if (onEditProfile) {
      closeThen(onEditProfile);
      return;
    }
    onToast?.(t("settings.account.editSoon"));
  };

  const openSection = (row: ProfileHomeRow) => {
    if (!row.available && onToast) {
      // The section exists in Telegram but not in this build yet; the toast
      // stays visible above the dialog (z-index 400).
      onToast(t("profileHome.comingSoon"));
      return;
    }
    closeThen(() => onOpenSettings(row.id));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.title")}
      closeLabel={t("settings.close")}
      width="560px"
      className="f-profile-home-dialog"
    >
      <div className="f-profile-home">
        <section className="f-profile-home-hero">
          <Avatar
            title={name}
            initials={initials}
            color={color}
            photo={photo}
            size={88}
            online={online}
            className="f-profile-home-avatar"
          />
          <h2 className="f-profile-home-name" dir="auto">
            {name}
          </h2>
          <p
            className="f-profile-home-status"
            data-online={online || undefined}
          >
            {online ? t("chat.online") : t("chat.lastSeen")}
          </p>
          <p className="f-profile-home-username">
            {handle ? (
              <span className="f-profile-home-username-value" dir="ltr">
                @{handle}
              </span>
            ) : (
              <span className="f-profile-home-username-empty">
                {t("settings.account.setUsername")}
              </span>
            )}
          </p>
          <button type="button" className="f-profile-home-edit" onClick={editProfile}>
            <Icon name="edit" size={13} />
            <span>{t("settings.account.edit")}</span>
          </button>
        </section>

        {phone ? (
          <button type="button" className="f-profile-home-phone" onClick={editProfile}>
            <span className="f-profile-home-tile" data-tone="green" aria-hidden="true">
              <Icon name="call" size={18} />
            </span>
            <span className="f-profile-home-phone-copy">
              <span className="f-profile-home-phone-label">
                {t("profileHome.phone")}
              </span>
              <span className="f-profile-home-phone-value" dir="ltr">
                {phone}
              </span>
            </span>
            <Icon
              name="chevron_right"
              size={16}
              className="f-profile-home-chevron"
            />
          </button>
        ) : null}

        <section className="f-profile-home-card">
          {PROFILE_HOME_ROWS.map((row) => (
            <button
              key={row.id}
              type="button"
              className="f-profile-home-row"
              onClick={() => openSection(row)}
            >
              <span
                className="f-profile-home-tile"
                style={{ "--tile-color": row.color } as CSSProperties}
                aria-hidden="true"
              >
                <Icon name={row.icon} size={18} />
              </span>
              <span className="f-profile-home-row-label">{t(row.labelKey)}</span>
              <Icon
                name="chevron_right"
                size={16}
                className="f-profile-home-chevron"
              />
            </button>
          ))}
        </section>

        {onLogout ? (
          <section className="f-profile-home-card">
            <button
              type="button"
              className="f-profile-home-row"
              data-danger
              onClick={() => closeThen(onLogout)}
            >
              <span className="f-profile-home-tile" data-tone="danger" aria-hidden="true">
                <Icon name="logout" size={18} />
              </span>
              <span className="f-profile-home-row-label">{t("common.logOut")}</span>
            </button>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
