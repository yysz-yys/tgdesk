import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Browser } from "@wailsio/runtime";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import {
  IconAdjustments,
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
  IconAt,
  IconInfoCircle,
  IconLanguage,
  IconLogout,
  IconPhone,
  IconPhoto,
  IconQrcode,
  IconTrash,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import type { Accent, AuthUser, Theme } from "../../types";
import type { AppSettings } from "../../hooks/useSettings";
import { Avatar } from "../ui/Avatar";
import "./settings-panel.css";

type Section =
  | "account"
  | "general"
  | "notifications"
  | "privacy"
  | "chat"
  | "folders"
  | "language"
  | "scale"
  | "faq"
  | "shortcuts"
  | "features"
  | "appearance"
  | "downloads"
  | "network"
  | "advanced"
  | "about";

interface SettingsItem {
  id: string;
  labelKey: string;
  section?: Section;
}

const SETTINGS_ITEMS: SettingsItem[] = [
  { id: "myAccount", labelKey: "settings.list.myAccount", section: "account" },
  { id: "notifications", labelKey: "settings.list.notifications", section: "notifications" },
  { id: "privacy", labelKey: "settings.list.privacy", section: "privacy" },
  { id: "chatSettings", labelKey: "settings.list.chatSettings", section: "chat" },
  { id: "folders", labelKey: "settings.list.folders", section: "folders" },
  { id: "advancedSettings", labelKey: "settings.list.advanced", section: "advanced" },
  { id: "speakers", labelKey: "settings.list.speakers" },
  { id: "battery", labelKey: "settings.list.battery" },
  { id: "language", labelKey: "settings.list.language", section: "language" },
  { id: "scale", labelKey: "settings.list.scale", section: "scale" },
  { id: "premium", labelKey: "settings.list.premium" },
  { id: "stars", labelKey: "settings.list.stars" },
  { id: "business", labelKey: "settings.list.business" },
  { id: "gifts", labelKey: "settings.list.gifts" },
  { id: "faq", labelKey: "settings.list.faq", section: "faq" },
  { id: "shortcuts", labelKey: "settings.list.shortcuts", section: "shortcuts" },
  { id: "features", labelKey: "settings.list.features", section: "features" },
  { id: "ask", labelKey: "settings.list.ask" },
  { id: "downloads", labelKey: "settings.list.downloads", section: "downloads" },
  { id: "network", labelKey: "settings.list.network", section: "network" },
  { id: "about", labelKey: "settings.list.about", section: "about" },
];

const ACCENTS: { id: Accent; labelKey: string; color: string }[] = [
  { id: "blue", labelKey: "settings.appearance.accents.blue", color: "#3390ec" },
  { id: "purple", labelKey: "settings.appearance.accents.purple", color: "#8774e1" },
  { id: "green", labelKey: "settings.appearance.accents.green", color: "#4fae4e" },
  { id: "orange", labelKey: "settings.appearance.accents.orange", color: "#f08a3c" },
  { id: "pink", labelKey: "settings.appearance.accents.pink", color: "#e05a8a" },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onReset: () => void;
  themePreference: Theme;
  onThemePreferenceChange: (theme: Theme) => void;
  onLogout: () => void;
  onToast: (message: string) => void;
  status: { appVersion: string; tdlVersion: string; tdlCoreVersion: string } | null;
  user: AuthUser | null;
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onUpdate,
  onReset,
  themePreference,
  onThemePreferenceChange,
  onLogout,
  onToast,
  status,
  user,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("general");
  const [view, setView] = useState<"list" | "page" | "placeholder">("list");
  const [pageTitle, setPageTitle] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const wallpaperInput = useRef<HTMLInputElement>(null);

  const chooseWallpaper = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      onToast(t("settings.chat.wallpaperTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }
      onUpdate("wallpaperImage", reader.result);
      onUpdate("wallpaper", "custom");
    };
    reader.readAsDataURL(file);
  };

  const openItem = (item: SettingsItem) => {
    if (item.section) {
      setSection(item.section);
      setPageTitle(t(item.labelKey));
      setView("page");
      return;
    }
    setPlaceholder(t(item.labelKey));
    setView("placeholder");
  };

  const renderAccount = () => (
    <>
      <div className="settings-account-hero">
        <Avatar
          title={user?.displayName ?? t("settings.general.telegramAccount")}
          initials={user?.initials ?? "T"}
          color={user?.color ?? "#65aadd"}
          size={88}
          online
        />
        <div className="settings-account-hero-name">
          {user?.displayName ?? t("settings.general.telegramAccount")}
        </div>
        <div className="settings-account-hero-status">{t("chat.online")}</div>
        <button
          type="button"
          className="settings-button"
          onClick={() => onToast(t("settings.account.editSoon"))}
        >
          {t("settings.account.edit")}
        </button>
      </div>

      <SettingsGroup title={t("settings.account.info")}>
        <SettingRow
          title={user?.phone ? formatPhone(user.phone) : t("settings.account.noPhone")}
          description={t("settings.account.phone")}
          icon={<IconPhone size={17} />}
        >
          <button
            type="button"
            className="settings-icon-button"
            onClick={() => onToast(t("settings.account.qrSoon"))}
            aria-label={t("settings.account.qr")}
          >
            <IconQrcode size={20} />
          </button>
        </SettingRow>
        <SettingRow
          title={user?.username ? `@${user.username}` : t("settings.account.setUsername")}
          description={t("settings.account.username")}
          icon={<IconAt size={17} />}
        >
          <button
            type="button"
            className="settings-icon-button"
            onClick={() => onToast(t("settings.account.usernameSoon"))}
            aria-label={t("settings.account.setUsername")}
          >
            <IconChevronRight size={18} />
          </button>
        </SettingRow>
        <SettingRow
          title={t("settings.account.bioEmpty")}
          description={t("settings.account.bio")}
          icon={<IconInfoCircle size={17} />}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settings.account.session")}>
        <button
          type="button"
          className="settings-logout-row"
          onClick={onLogout}
        >
          <IconLogout size={17} />
          {t("settings.general.logOut")}
        </button>
      </SettingsGroup>
    </>
  );

  const renderNotifications = () => (
    <>
      <SettingsGroup title={t("settings.notifications.title")}>
        <p className="settings-note">{t("settings.notifications.note")}</p>
        <SettingRow
          title={t("settings.notifications.downloads")}
          description={t("settings.notifications.downloadsDesc")}
        >
          <SettingSwitch
            label={t("settings.notifications.downloads")}
            checked={settings.notifications}
            onCheckedChange={(value) => onUpdate("notifications", value)}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.notifications.messages")}>
        <SettingRow
          title={t("settings.notifications.messageNotifications")}
          description={t("settings.notifications.messageNotificationsDesc")}
        >
          <span className="settings-coming">{t("settings.comingSoon")}</span>
        </SettingRow>
        <SettingRow
          title={t("settings.notifications.sound")}
          description={t("settings.notifications.soundDesc")}
        >
          <span className="settings-coming">{t("settings.comingSoon")}</span>
        </SettingRow>
      </SettingsGroup>
    </>
  );

  const renderChat = () => (
    <>
      <SettingsGroup title={t("settings.chat.title")}>
        <SettingRow
          title={t("settings.appearance.messageSize")}
          description={t("settings.appearance.messageSizeDesc", {
            size: settings.messageSize,
          })}
        >
          <Slider.Root
            className="slider-root"
            min={12}
            max={20}
            step={1}
            value={[settings.messageSize]}
            onValueChange={([value]) => onUpdate("messageSize", value)}
            aria-label={t("settings.appearance.messageSize")}
          >
            <Slider.Track className="slider-track">
              <Slider.Range className="slider-range" />
            </Slider.Track>
            <Slider.Thumb className="slider-thumb" />
          </Slider.Root>
        </SettingRow>
        <SettingRow
          title={t("settings.appearance.pattern")}
          description={t("settings.appearance.patternDesc")}
        >
          <SettingSwitch
            label={t("settings.appearance.pattern")}
            checked={settings.chatPattern}
            onCheckedChange={(value) => onUpdate("chatPattern", value)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.chat.wallpaper")}
          description={t("settings.chat.wallpaperDesc")}
        >
          <SettingSelect
            ariaLabel={t("settings.chat.wallpaper")}
            value={settings.wallpaper}
            onValueChange={(value) =>
              onUpdate("wallpaper", value as AppSettings["wallpaper"])
            }
            options={[
              { value: "glow", label: t("settings.chat.wallpapers.glow") },
              { value: "plain", label: t("settings.chat.wallpapers.plain") },
              { value: "blue", label: t("settings.chat.wallpapers.blue") },
              ...(settings.wallpaperImage
                ? [{ value: "custom", label: t("settings.chat.wallpapers.custom") }]
                : []),
            ]}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.chat.wallpaperImage")}
          description={t("settings.chat.wallpaperImageDesc")}
        >
          <div className="settings-wallpaper-actions">
            <input
              ref={wallpaperInput}
              className="settings-file-input"
              type="file"
              accept="image/*"
              onChange={chooseWallpaper}
            />
            <button
              type="button"
              className="settings-button"
              onClick={() => wallpaperInput.current?.click()}
            >
              <IconPhoto size={15} />
              {t("settings.chat.chooseWallpaper")}
            </button>
            {settings.wallpaperImage ? (
              <button
                type="button"
                className="settings-icon-button"
                onClick={() => {
                  onUpdate("wallpaperImage", "");
                  if (settings.wallpaper === "custom") {
                    onUpdate("wallpaper", "glow");
                  }
                }}
                aria-label={t("settings.chat.removeWallpaper")}
              >
                <IconTrash size={16} />
              </button>
            ) : null}
          </div>
        </SettingRow>
        <SettingRow
          title={t("settings.chat.enterToSend")}
          description={t("settings.chat.enterToSendDesc")}
        >
          <SettingSwitch
            label={t("settings.chat.enterToSend")}
            checked={settings.enterToSend}
            onCheckedChange={(value) => onUpdate("enterToSend", value)}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );

  const renderScale = () => (
    <SettingsGroup title={t("settings.scale.title")}>
      <p className="settings-note">{t("settings.scale.note")}</p>
      <SettingRow
        title={t("settings.scale.title")}
        description={t("settings.scale.description", {
          percent: settings.interfaceScale,
        })}
      >
        <SettingSelect
          ariaLabel={t("settings.scale.title")}
          value={String(settings.interfaceScale)}
          onValueChange={(value) => onUpdate("interfaceScale", Number(value))}
          options={[100, 110, 125, 150].map((percent) => ({
            value: String(percent),
            label: `${percent}%`,
          }))}
        />
      </SettingRow>
    </SettingsGroup>
  );

  const renderFaq = () => (
    <SettingsGroup title={t("settings.faq.title")}>
      <p className="settings-note">{t("settings.faq.note")}</p>
      {[
        ["faq", "https://telegram.org/faq"],
        ["blog", "https://telegram.org/blog"],
        ["support", "https://telegram.org/support"],
        ["privacy", "https://telegram.org/privacy"],
      ].map(([key, url]) => (
        <button
          key={key}
          type="button"
          className="settings-link-row"
          onClick={() => void Browser.OpenURL(url)}
        >
          <span>{t(`settings.faq.${key}`)}</span>
          <IconChevronRight size={17} />
        </button>
      ))}
    </SettingsGroup>
  );

  const renderShortcuts = () => (
    <SettingsGroup title={t("settings.shortcuts.title")}>
      <p className="settings-note">{t("settings.shortcuts.note")}</p>
      {[
        ["search", "Ctrl + F"],
        ["folders", "Ctrl + Shift + F"],
        ["newMessage", "Ctrl + N"],
        ["send", "Enter"],
        ["newline", "Shift + Enter"],
        ["close", "Esc"],
      ].map(([key, value]) => (
        <div className="settings-shortcut-row" key={key}>
          <span>{t(`settings.shortcuts.${key}`)}</span>
          <kbd>{value}</kbd>
        </div>
      ))}
    </SettingsGroup>
  );

  const renderFeatures = () => (
    <SettingsGroup title={t("settings.features.title")}>
      <p className="settings-note">{t("settings.features.note")}</p>
      {[
        ["chats", "https://telegram.org/blog"],
        ["media", "https://telegram.org/blog"],
        ["security", "https://telegram.org/faq#security"],
      ].map(([key, url]) => (
        <button
          key={key}
          type="button"
          className="settings-link-row"
          onClick={() => void Browser.OpenURL(url)}
        >
          <span>{t(`settings.features.${key}`)}</span>
          <IconChevronRight size={17} />
        </button>
      ))}
    </SettingsGroup>
  );

  const renderPrivacy = () => (
    <>
      <SettingsGroup title={t("settings.privacy.security")}>
        <SettingRow
          title={t("settings.privacy.twoStep")}
          description={t("settings.privacy.twoStepDesc")}
        >
          <span className="settings-coming">{t("settings.comingSoon")}</span>
        </SettingRow>
        <SettingRow
          title={t("settings.privacy.sessions")}
          description={t("settings.privacy.sessionsDesc")}
        >
          <span className="settings-value">{t("settings.privacy.thisDevice")}</span>
        </SettingRow>
        <SettingRow
          title={t("settings.privacy.passcode")}
          description={t("settings.privacy.passcodeDesc")}
        >
          <span className="settings-coming">{t("settings.comingSoon")}</span>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.privacy.privacy")}>
        {[
          "phone",
          "lastSeen",
          "photo",
          "calls",
          "groups",
          "forwards",
        ].map((key) => (
          <SettingRow
            key={key}
            title={t(`settings.privacy.${key}`)}
            description={t(`settings.privacy.${key}Desc`)}
          >
            <span className="settings-coming">{t("settings.comingSoon")}</span>
          </SettingRow>
        ))}
      </SettingsGroup>

      <SettingsGroup title={t("settings.privacy.data")}>
        <SettingRow
          title={t("settings.privacy.blocked")}
          description={t("settings.privacy.blockedDesc")}
        >
          <span className="settings-coming">{t("settings.comingSoon")}</span>
        </SettingRow>
        <SettingRow
          title={t("settings.privacy.deleteAccount")}
          description={t("settings.privacy.deleteAccountDesc")}
        >
          <span className="settings-coming">{t("settings.comingSoon")}</span>
        </SettingRow>
      </SettingsGroup>
    </>
  );

  const renderFolders = () => (
    <SettingsGroup title={t("settings.folders.title")}>
      <p className="settings-note">{t("settings.folders.note")}</p>
      <SettingRow title={t("settings.folders.all")} description={t("settings.folders.allDesc")}>
        <span className="settings-value">{t("settings.folders.active")}</span>
      </SettingRow>
    </SettingsGroup>
  );

  const renderLanguage = () => (
    <SettingsGroup title={t("settings.language.title")}>
      <SettingRow
        title={t("settings.general.language")}
        description={t("settings.general.languageDesc")}
      >
        <SettingSelect
          ariaLabel={t("settings.general.language")}
          value={settings.language}
          onValueChange={(value) => onUpdate("language", value as AppSettings["language"])}
          options={[
            { value: "system", label: t("common.systemDefault") },
            { value: "en", label: "English" },
            { value: "zh", label: "简体中文" },
            { value: "ja", label: "日本語" },
          ]}
        />
      </SettingRow>
      <p className="settings-note">{t("settings.language.note")}</p>
    </SettingsGroup>
  );

  const renderGeneral = () => (
    <>
      <SettingsGroup title={t("settings.general.account")}>
        <div className="settings-row">
          <Avatar
            title={user?.displayName ?? t("settings.general.telegramAccount")}
            initials={user?.initials ?? "T"}
            color={user?.color ?? "#65aadd"}
            size={42}
            online
          />
          <div className="settings-row-copy">
            <div className="settings-row-title">
              {user?.displayName ?? t("settings.general.telegramAccount")}
            </div>
            <div className="settings-row-description">
              {user?.username
                ? `@${user.username}`
                : t("settings.general.telegramAccount")}
            </div>
          </div>
          <button type="button" className="settings-button danger" onClick={onLogout}>
            <IconLogout size={15} />
            {t("settings.general.logOut")}
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.nav.general")}>
        <SettingRow
          icon={<IconLanguage size={17} />}
          title={t("settings.general.language")}
          description={t("settings.general.languageDesc")}
        >
          <SettingSelect
            ariaLabel={t("settings.general.language")}
            value={settings.language}
            onValueChange={(value) => onUpdate("language", value as AppSettings["language"])}
            options={[
              { value: "system", label: t("common.systemDefault") },
              { value: "en", label: "English" },
              { value: "zh", label: "简体中文" },
              { value: "ja", label: "日本語" },
            ]}
          />
        </SettingRow>
        <SettingRow
          icon={<IconAdjustments size={17} />}
          title={t("settings.general.startWithWindows")}
          description={t("settings.general.startWithWindowsDesc")}
        >
          <SettingSwitch
            label={t("settings.general.startWithWindows")}
            checked={settings.startWithWindows}
            onCheckedChange={(value) => onUpdate("startWithWindows", value)}
          />
        </SettingRow>
        <SettingRow
          icon={<IconX size={17} />}
          title={t("settings.general.closeToTray")}
          description={t("settings.general.closeToTrayDesc")}
        >
          <SettingSwitch
            label={t("settings.general.closeToTray")}
            checked={settings.closeToTray}
            onCheckedChange={(value) => onUpdate("closeToTray", value)}
          />
        </SettingRow>
        <SettingRow
          icon={<IconInfoCircle size={17} />}
          title={t("settings.general.notifications")}
          description={t("settings.general.notificationsDesc")}
        >
          <SettingSwitch
            label={t("settings.general.notifications")}
            checked={settings.notifications}
            onCheckedChange={(value) => onUpdate("notifications", value)}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );

  const renderAppearance = () => (
    <>
      <SettingsGroup title={t("settings.appearance.theme")}>
        <div className="theme-grid">
          {(
            [
              { id: "light", labelKey: "settings.appearance.light" },
              { id: "dark", labelKey: "settings.appearance.dark" },
              { id: "system", labelKey: "settings.appearance.system" },
            ] as { id: Theme; labelKey: string }[]
          ).map((item) => (
            <button
              type="button"
              className="theme-card"
              data-active={themePreference === item.id}
              key={item.id}
              onClick={() => onThemePreferenceChange(item.id)}
            >
              <span className={`theme-preview theme-preview-${item.id}`}>
                <span className="theme-preview-sidebar" />
                <span className="theme-preview-bubble" />
              </span>
              <span className="theme-card-label">{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.appearance.accentColor")}>
        <div className="accent-row">
          {ACCENTS.map((accent) => (
            <button
              type="button"
              className="accent-swatch"
              data-active={settings.accent === accent.id}
              key={accent.id}
              aria-label={t(accent.labelKey)}
              title={t(accent.labelKey)}
              style={{ background: accent.color }}
              onClick={() => onUpdate("accent", accent.id)}
            >
              {settings.accent === accent.id && <IconCheck size={14} stroke={3} />}
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.appearance.chat")}>
        <SettingRow
          title={t("settings.appearance.messageSize")}
          description={t("settings.appearance.messageSizeDesc", { size: settings.messageSize })}
        >
          <Slider.Root
            className="slider-root"
            min={13}
            max={18}
            step={1}
            value={[settings.messageSize]}
            onValueChange={([value]) => onUpdate("messageSize", value)}
            aria-label={t("settings.appearance.messageSize")}
          >
            <Slider.Track className="slider-track">
              <Slider.Range className="slider-range" />
            </Slider.Track>
            <Slider.Thumb className="slider-thumb" />
          </Slider.Root>
        </SettingRow>
        <SettingRow
          title={t("settings.appearance.pattern")}
          description={t("settings.appearance.patternDesc")}
        >
          <SettingSwitch
            label={t("settings.appearance.pattern")}
            checked={settings.chatPattern}
            onCheckedChange={(value) => onUpdate("chatPattern", value)}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );

  const renderDownloads = () => (
    <>
      <SettingsGroup title={t("settings.downloads.destination")}>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-title">{t("settings.downloads.folder")}</div>
            <div className="settings-row-description path-value">{settings.downloadDir}</div>
          </div>
          <button
            type="button"
            className="settings-button"
            onClick={() => onToast(t("settings.toasts.folderPicker"))}
          >
            {t("settings.downloads.change")}
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.downloads.transfer")}>
        <SettingRow
          title={t("settings.downloads.concurrent")}
          description={t("settings.downloads.concurrentDesc", {
            count: settings.concurrency,
          })}
        >
          <Slider.Root
            className="slider-root"
            min={1}
            max={6}
            step={1}
            value={[settings.concurrency]}
            onValueChange={([value]) => onUpdate("concurrency", value)}
            aria-label={t("settings.downloads.concurrent")}
          >
            <Slider.Track className="slider-track">
              <Slider.Range className="slider-range" />
            </Slider.Track>
            <Slider.Thumb className="slider-thumb" />
          </Slider.Root>
        </SettingRow>
        <SettingRow
          title={t("settings.downloads.threads")}
          description={t("settings.downloads.threadsDesc", { count: settings.threads })}
        >
          <Slider.Root
            className="slider-root"
            min={1}
            max={16}
            step={1}
            value={[settings.threads]}
            onValueChange={([value]) => onUpdate("threads", value)}
            aria-label={t("settings.downloads.threads")}
          >
            <Slider.Track className="slider-track">
              <Slider.Range className="slider-range" />
            </Slider.Track>
            <Slider.Thumb className="slider-thumb" />
          </Slider.Root>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.downloads.files")}>
        <div className="settings-row settings-row-stack">
          <div className="settings-row-copy">
            <div className="settings-row-title">{t("settings.downloads.template")}</div>
            <div className="settings-row-description">
              {t("settings.downloads.templateDesc")}
            </div>
          </div>
          <input
            className="settings-input settings-input-wide"
            value={settings.template}
            onChange={(event) => onUpdate("template", event.target.value)}
            spellCheck={false}
          />
        </div>
        <SettingRow
          title={t("settings.downloads.skipSame")}
          description={t("settings.downloads.skipSameDesc")}
        >
          <SettingSwitch
            label={t("settings.downloads.skipSame")}
            checked={settings.skipSame}
            onCheckedChange={(value) => onUpdate("skipSame", value)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.downloads.takeout")}
          description={t("settings.downloads.takeoutDesc")}
        >
          <SettingSwitch
            label={t("settings.downloads.takeout")}
            checked={settings.takeout}
            onCheckedChange={(value) => onUpdate("takeout", value)}
          />
        </SettingRow>
        <SettingRow
          title={t("settings.downloads.rewriteExt")}
          description={t("settings.downloads.rewriteExtDesc")}
        >
          <SettingSwitch
            label={t("settings.downloads.rewriteExt")}
            checked={settings.rewriteExt}
            onCheckedChange={(value) => onUpdate("rewriteExt", value)}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );

  const renderNetwork = () => (
    <>
      <SettingsGroup title={t("settings.network.proxy")}>
        <SettingRow
          title={t("settings.network.proxyType")}
          description={t("settings.network.proxyTypeDesc")}
        >
          <SettingSelect
            ariaLabel={t("settings.network.proxyType")}
            value={settings.proxyType}
            onValueChange={(value) => onUpdate("proxyType", value as AppSettings["proxyType"])}
            options={[
              { value: "none", label: t("settings.network.none") },
              { value: "socks5", label: t("settings.network.socks5") },
              { value: "http", label: t("settings.network.http") },
            ]}
          />
        </SettingRow>

        {settings.proxyType !== "none" && (
          <>
            <div className="settings-row settings-row-stack">
              <div className="settings-row-copy">
                <div className="settings-row-title">{t("settings.network.hostPort")}</div>
                <div className="settings-row-description">
                  {t("settings.network.hostPortDesc")}
                </div>
              </div>
              <div className="inline-fields">
                <input
                  className="settings-input"
                  value={settings.proxyHost}
                  onChange={(event) => onUpdate("proxyHost", event.target.value)}
                  placeholder={t("settings.network.host")}
                  spellCheck={false}
                />
                <input
                  className="settings-input settings-input-port"
                  value={settings.proxyPort}
                  onChange={(event) => onUpdate("proxyPort", event.target.value)}
                  placeholder={t("settings.network.port")}
                  inputMode="numeric"
                />
              </div>
            </div>
            <SettingRow
              title={t("settings.network.username")}
              description={t("settings.network.usernameDesc")}
            >
              <input
                className="settings-input"
                value={settings.proxyUser}
                onChange={(event) => onUpdate("proxyUser", event.target.value)}
                placeholder={t("settings.network.username")}
                spellCheck={false}
              />
            </SettingRow>
            <SettingRow
              title={t("settings.network.password")}
              description={t("settings.network.passwordDesc")}
            >
              <input
                className="settings-input"
                type="password"
                value={settings.proxyPass}
                onChange={(event) => onUpdate("proxyPass", event.target.value)}
                placeholder={t("settings.network.password")}
              />
            </SettingRow>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("settings.network.time")}>
        <SettingRow
          title={t("settings.network.ntp")}
          description={t("settings.network.ntpDesc")}
        >
          <input
            className="settings-input"
            value={settings.ntp}
            onChange={(event) => onUpdate("ntp", event.target.value)}
            placeholder="pool.ntp.org"
            spellCheck={false}
          />
        </SettingRow>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-title">{t("settings.network.testConnection")}</div>
            <div className="settings-row-description">
              {t("settings.network.testConnectionDesc")}
            </div>
          </div>
          <button
            type="button"
            className="settings-button"
            onClick={() => onToast(t("settings.toasts.networkTest"))}
          >
            {t("settings.network.test")}
          </button>
        </div>
      </SettingsGroup>
    </>
  );

  const renderAdvanced = () => (
    <>
      <SettingsGroup title={t("settings.advanced.diagnostics")}>
        <SettingRow
          title={t("settings.advanced.logLevel")}
          description={t("settings.advanced.logLevelDesc")}
        >
          <SettingSelect
            ariaLabel={t("settings.advanced.logLevel")}
            value={settings.logLevel}
            onValueChange={(value) => onUpdate("logLevel", value as AppSettings["logLevel"])}
            options={[
              { value: "info", label: t("settings.advanced.info") },
              { value: "debug", label: t("settings.advanced.debug") },
            ]}
          />
        </SettingRow>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-title">{t("settings.advanced.exportLogs")}</div>
            <div className="settings-row-description">
              {t("settings.advanced.exportLogsDesc")}
            </div>
          </div>
          <button
            type="button"
            className="settings-button"
            onClick={() => onToast(t("settings.toasts.logExport"))}
          >
            {t("settings.advanced.export")}
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.advanced.storage")}>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-title">{t("settings.advanced.cache")}</div>
            <div className="settings-row-description">{t("settings.advanced.cacheDesc")}</div>
          </div>
          <button
            type="button"
            className="settings-button"
            onClick={() => onToast(t("settings.toasts.cacheCleared"))}
          >
            {t("settings.advanced.clear")}
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.advanced.reset")}>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-title">{t("settings.advanced.resetSettings")}</div>
            <div className="settings-row-description">{t("settings.advanced.resetDesc")}</div>
          </div>
          <button
            type="button"
            className="settings-button danger"
            onClick={() => {
              onReset();
              onToast(t("settings.toasts.settingsReset"));
            }}
          >
            <IconRefresh size={15} />
            {t("settings.advanced.resetButton")}
          </button>
        </div>
      </SettingsGroup>
    </>
  );

  const renderAbout = () => (
    <div className="about-settings">
      <div className="about-settings-brand">
        <span className="about-settings-logo">tg</span>
        <div>
          <h2>tgdesk</h2>
          <p>{t("settings.about.description")}</p>
        </div>
      </div>

      <div className="settings-group-body">
        <InfoRow label="tgdesk" value={status?.appVersion ?? "0.1.0"} />
        <InfoRow label="tdl" value={status?.tdlVersion ?? "v0.20.4"} />
        <InfoRow label="tdl/core" value={status?.tdlCoreVersion ?? "v0.20.4"} />
        <InfoRow label={t("settings.about.license")} value="AGPL-3.0" />
      </div>

      <p className="about-settings-note">{t("settings.about.disclaimer")}</p>

      <a
        className="settings-button about-link"
        href="https://github.com/iyear/tdl"
        target="_blank"
        rel="noreferrer"
      >
        <IconExternalLink size={15} />
        {t("settings.about.github")}
      </a>
    </div>
  );

  const content = (() => {
    switch (section) {
      case "account":
        return renderAccount();
      case "general":
        return renderGeneral();
      case "notifications":
        return renderNotifications();
      case "privacy":
        return renderPrivacy();
      case "chat":
        return renderChat();
      case "folders":
        return renderFolders();
      case "language":
        return renderLanguage();
      case "scale":
        return renderScale();
      case "faq":
        return renderFaq();
      case "shortcuts":
        return renderShortcuts();
      case "features":
        return renderFeatures();
      case "appearance":
        return renderAppearance();
      case "downloads":
        return renderDownloads();
      case "network":
        return renderNetwork();
      case "advanced":
        return renderAdvanced();
      case "about":
        return renderAbout();
    }
  })();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setView("list");
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content className="settings-sheet">
          <header className="settings-sheet-header">
            {view !== "list" ? (
              <button
                type="button"
                className="icon-button"
                onClick={() => setView("list")}
                aria-label={t("settings.back")}
              >
                <IconArrowLeft size={21} />
              </button>
            ) : null}
            <Dialog.Title className="settings-sheet-title">
              {view === "list"
                ? t("settings.title")
                : view === "placeholder"
                  ? placeholder
                  : pageTitle || t("settings.title")}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {t("settings.description")}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label={t("settings.close")}>
                <IconX size={21} />
              </button>
            </Dialog.Close>
          </header>

          <div className="settings-sheet-scroll">
            {view === "list" ? (
              <>
                <div className="settings-account">
                  <Avatar
                    title={user?.displayName ?? t("settings.general.telegramAccount")}
                    initials={user?.initials ?? "T"}
                    color={user?.color ?? "#65aadd"}
                    size={72}
                    online
                  />
                  <div className="settings-account-copy">
                    <div className="settings-account-name">
                      {user?.displayName ?? t("settings.general.telegramAccount")}
                    </div>
                    <div className="settings-account-detail">
                      {user?.phone
                        ? formatPhone(user.phone)
                        : user?.username
                          ? `@${user.username}`
                          : t("settings.account.noPhone")}
                    </div>
                    <button
                      type="button"
                      className="settings-account-link"
                      onClick={() => onToast(t("settings.account.usernameSoon"))}
                    >
                      {user?.username ? `@${user.username}` : t("settings.account.setUsername")}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="settings-qr"
                    onClick={() => onToast(t("settings.account.qrSoon"))}
                    aria-label={t("settings.account.qr")}
                  >
                    <IconQrcode size={22} />
                  </button>
                </div>

                <div className="settings-list">
                  {SETTINGS_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="settings-list-item"
                      onClick={() => openItem(item)}
                    >
                      <span>{t(item.labelKey)}</span>
                      <IconChevronRight size={17} />
                    </button>
                  ))}
                </div>
              </>
            ) : view === "placeholder" ? (
              <div className="settings-placeholder">
                <div className="settings-placeholder-icon">
                  <IconInfoCircle size={26} />
                </div>
                <h2>{placeholder}</h2>
                <p>{t("settings.placeholderDescription")}</p>
              </div>
            ) : (
              <div className="settings-content">{content}</div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <div className="settings-group-title">{title}</div>
      <div className="settings-group-body">{children}</div>
    </section>
  );
}

function SettingRow({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="settings-row">
      {icon && <span className="settings-row-icon">{icon}</span>}
      <div className="settings-row-copy">
        <div className="settings-row-title">{title}</div>
        {description && <div className="settings-row-description">{description}</div>}
      </div>
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  );
}

function SettingSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Switch.Root
      className="switch"
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
    >
      <Switch.Thumb className="switch-thumb" />
    </Switch.Root>
  );
}

function SettingSelect({
  ariaLabel,
  value,
  onValueChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className="select-trigger" aria-label={ariaLabel}>
        <Select.Value />
        <Select.Icon>
          <IconChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" sideOffset={4}>
          <Select.Viewport className="select-viewport">
            {options.map((option) => (
              <Select.Item className="select-item" value={option.value} key={option.value}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="select-indicator">
                  <IconCheck size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function formatPhone(phone: string) {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row settings-info-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
