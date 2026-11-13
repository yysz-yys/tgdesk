import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { AppSettings } from "../../hooks/useSettings";
import {
  Button,
  Dialog,
  Icon,
  IconButton,
  SelectField,
  Slider,
  Switch,
  TextField,
} from "../../ui";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onOpenDownloadFolder: () => void;
  onChooseDownloadFolder: () => void;
}

/** Only the settings that the chat and download features actually use. */
export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onUpdate,
  onOpenDownloadFolder,
  onChooseDownloadFolder,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const themeOptions = [
    {
      value: "system",
      label: t("settings.appearance.system"),
      icon: "brightness_auto",
    },
    {
      value: "light",
      label: t("settings.appearance.light"),
      icon: "light_mode",
    },
    {
      value: "dark",
      label: t("settings.appearance.dark"),
      icon: "dark_mode",
    },
  ] as const;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.title")}
      description={t("settings.description")}
      hideDescription
      closeLabel={t("settings.close")}
      width="560px"
      className="f-settings-dialog"
    >
      <div className="f-settings">
        <SettingsGroup title={t("settings.nav.appearance")}>
          <SettingRow title={t("settings.appearance.theme")} stack>
            <div
              className="f-theme-picker"
              role="radiogroup"
              aria-label={t("settings.appearance.theme")}
            >
              {themeOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  role="radio"
                  aria-checked={settings.theme === option.value}
                  data-active={settings.theme === option.value || undefined}
                  className="f-theme-option"
                  onClick={() =>
                    onUpdate("theme", option.value as AppSettings["theme"])
                  }
                >
                  <Icon name={option.icon} size={15} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow title={t("settings.general.language")}>
            <SelectField
              className="f-settings-select"
              size="2"
              value={settings.language}
              onValueChange={(value) =>
                onUpdate("language", value as AppSettings["language"])
              }
              ariaLabel={t("settings.general.language")}
              options={[
                { value: "system", label: t("common.systemDefault") },
                { value: "en", label: "English" },
                { value: "zh", label: "简体中文" },
                { value: "ja", label: "日本語" },
              ]}
            />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title={t("settings.nav.general")}>
          <SettingRow title={t("settings.chat.enterToSend")}>
            <Switch
              label={t("settings.chat.enterToSend")}
              checked={settings.enterToSend}
              onCheckedChange={(value) => onUpdate("enterToSend", value)}
            />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title={t("settings.nav.downloads")}>
          <div className="f-settings-path">
            <span className="f-settings-path-icon">
              <Icon name="folder" size={17} />
            </span>
            <div className="f-settings-path-copy">
              <div className="f-settings-row-title">{t("settings.downloads.folder")}</div>
              <div className="f-settings-path-value" title={settings.downloadDir}>
                {settings.downloadDir || "—"}
              </div>
            </div>
            <Button
              variant="surface"
              size="1"
              onClick={onChooseDownloadFolder}
            >
              {t("settings.downloads.change")}
            </Button>
            <IconButton
              label={t("downloads.openFolder")}
              icon="folder_open"
              size="1"
              onClick={onOpenDownloadFolder}
            />
          </div>

          <SettingRow title={t("settings.downloads.threads")}>
            <div className="f-settings-slider">
              <Slider
                min={1}
                max={16}
                step={1}
                value={settings.threads}
                onValueChange={(value) => onUpdate("threads", value)}
                label={t("settings.downloads.threads")}
              />
              <span className="f-settings-slider-value">{settings.threads}</span>
            </div>
          </SettingRow>

          <SettingRow title={t("settings.downloads.tdlStreaming")}>
            <Switch
              label={t("settings.downloads.tdlStreaming")}
              checked={settings.tdlStreaming}
              onCheckedChange={(value) => onUpdate("tdlStreaming", value)}
            />
          </SettingRow>

          <div className="f-settings-stack">
            <TextField
              size="2"
              value={settings.template}
              onValueChange={(value) => onUpdate("template", value)}
              label={t("settings.downloads.template")}
              autoComplete="off"
            />
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("settings.nav.network")}>
          <SettingRow title={t("settings.network.proxyType")}>
            <SelectField
              className="f-settings-select"
              size="2"
              value={settings.proxyType}
              onValueChange={(value) =>
                onUpdate("proxyType", value as AppSettings["proxyType"])
              }
              ariaLabel={t("settings.network.proxyType")}
              options={[
                { value: "none", label: t("settings.network.none") },
                { value: "socks5", label: t("settings.network.socks5") },
                { value: "http", label: t("settings.network.http") },
              ]}
            />
          </SettingRow>

          {settings.proxyType !== "none" ? (
            <>
              <div className="f-settings-stack">
                <div className="f-settings-row-title">{t("settings.network.hostPort")}</div>
                <div className="f-settings-inline">
                  <TextField
                    size="2"
                    value={settings.proxyHost}
                    onValueChange={(value) => onUpdate("proxyHost", value)}
                    label={t("settings.network.host")}
                    placeholder="127.0.0.1"
                    autoComplete="off"
                  />
                  <TextField
                    size="2"
                    value={settings.proxyPort}
                    onValueChange={(value) => onUpdate("proxyPort", value)}
                    label={t("settings.network.port")}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>
              </div>

              <SettingRow title={t("settings.network.username")}>
                <TextField
                  className="f-settings-short"
                  size="2"
                  value={settings.proxyUser}
                  onValueChange={(value) => onUpdate("proxyUser", value)}
                  aria-label={t("settings.network.username")}
                  placeholder={t("settings.network.username")}
                  autoComplete="off"
                />
              </SettingRow>
              <SettingRow title={t("settings.network.password")}>
                <TextField
                  className="f-settings-short"
                  size="2"
                  type="password"
                  value={settings.proxyPass}
                  onValueChange={(value) => onUpdate("proxyPass", value)}
                  aria-label={t("settings.network.password")}
                  placeholder={t("settings.network.password")}
                  autoComplete="off"
                />
              </SettingRow>
            </>
          ) : null}

          <SettingRow title={t("settings.network.ntp")}>
            <TextField
              className="f-settings-short"
              size="2"
              value={settings.ntp}
              onValueChange={(value) => onUpdate("ntp", value)}
              aria-label={t("settings.network.ntp")}
              placeholder="pool.ntp.org"
              autoComplete="off"
            />
          </SettingRow>
        </SettingsGroup>
      </div>
    </Dialog>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="f-settings-group">
      <h2>{title}</h2>
      <div className="f-settings-card">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  children,
  stack = false,
}: {
  title: string;
  children?: ReactNode;
  stack?: boolean;
}) {
  return (
    <div className="f-settings-row" data-stack={stack || undefined}>
      <div className="f-settings-row-copy">
        <div className="f-settings-row-title">{title}</div>
      </div>
      {children ? <div className="f-settings-row-control">{children}</div> : null}
    </div>
  );
}
