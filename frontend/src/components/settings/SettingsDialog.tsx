import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { AppSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SelectField } from "../ui/SelectField";
import { Sheet } from "../ui/Sheet";
import { Slider } from "../ui/Slider";
import { Switch } from "../ui/Switch";
import { TextField } from "../ui/TextField";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onOpenDownloadFolder: () => void;
}

// Only settings that the chat and download features actually use.
export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onUpdate,
  onOpenDownloadFolder,
}: SettingsDialogProps) {
  const { t } = useTranslation();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.title")}
      description={t("settings.description")}
      closeLabel={t("settings.close")}
      width={480}
    >
      <div className="g-settings">
        <SettingsGroup title={t("settings.nav.appearance")}>
          <SettingRow
            title={t("settings.appearance.theme")}
            description={t("settings.appearance.themeDesc")}
            stack
          >
            <SegmentedControl
              value={settings.theme}
              onChange={(value) => onUpdate("theme", value)}
              label={t("settings.appearance.theme")}
              options={[
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
              ]}
            />
          </SettingRow>
          <SettingRow
            title={t("settings.general.language")}
            description={t("settings.general.languageDesc")}
          >
            <SelectField
              className="g-settings-select"
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
          <SettingRow
            title={t("settings.chat.enterToSend")}
            description={t("settings.chat.enterToSendDesc")}
          >
            <Switch
              label={t("settings.chat.enterToSend")}
              checked={settings.enterToSend}
              onCheckedChange={(value) => onUpdate("enterToSend", value)}
            />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title={t("settings.nav.downloads")}>
          <div className="g-settings-path">
            <span className="g-settings-path-icon">
              <Icon name="folder" size={20} />
            </span>
            <div className="g-settings-path-copy">
              <div className="g-settings-row-title">{t("settings.downloads.folder")}</div>
              <div className="g-settings-path-value" title={settings.downloadDir}>
                {settings.downloadDir || "—"}
              </div>
            </div>
            <IconButton
              label={t("downloads.openFolder")}
              icon="folder_open"
              onClick={onOpenDownloadFolder}
            />
          </div>

          <SettingRow
            title={t("settings.downloads.threads")}
            description={t("settings.downloads.threadsDesc", {
              count: settings.threads,
            })}
          >
            <div className="g-settings-slider">
              <Slider
                min={1}
                max={16}
                step={1}
                value={settings.threads}
                onValueChange={(value) => onUpdate("threads", value)}
                label={t("settings.downloads.threads")}
              />
              <span className="g-settings-slider-value">{settings.threads}</span>
            </div>
          </SettingRow>

          <div className="g-settings-stack">
            <TextField
              value={settings.template}
              onValueChange={(value) => onUpdate("template", value)}
              label={t("settings.downloads.template")}
              supportingText={t("settings.downloads.templateDesc")}
              autoComplete="off"
            />
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("settings.nav.network")}>
          <SettingRow
            title={t("settings.network.proxyType")}
            description={t("settings.network.proxyTypeDesc")}
          >
            <SelectField
              className="g-settings-select"
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
              <div className="g-settings-stack">
                <div>
                  <div className="g-settings-row-title">{t("settings.network.hostPort")}</div>
                  <div className="g-settings-row-description">
                    {t("settings.network.hostPortDesc")}
                  </div>
                </div>
                <div className="g-settings-inline">
                  <TextField
                    value={settings.proxyHost}
                    onValueChange={(value) => onUpdate("proxyHost", value)}
                    label={t("settings.network.host")}
                    placeholder="127.0.0.1"
                    autoComplete="off"
                  />
                  <TextField
                    className="g-settings-port"
                    value={settings.proxyPort}
                    onValueChange={(value) => onUpdate("proxyPort", value)}
                    label={t("settings.network.port")}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>
              </div>

              <SettingRow
                title={t("settings.network.username")}
                description={t("settings.network.usernameDesc")}
              >
                <TextField
                  className="g-settings-short-field"
                  value={settings.proxyUser}
                  onValueChange={(value) => onUpdate("proxyUser", value)}
                  ariaLabel={t("settings.network.username")}
                  placeholder={t("settings.network.username")}
                  autoComplete="off"
                />
              </SettingRow>
              <SettingRow
                title={t("settings.network.password")}
                description={t("settings.network.passwordDesc")}
              >
                <TextField
                  className="g-settings-short-field"
                  type="password"
                  value={settings.proxyPass}
                  onValueChange={(value) => onUpdate("proxyPass", value)}
                  ariaLabel={t("settings.network.password")}
                  placeholder={t("settings.network.password")}
                  autoComplete="off"
                />
              </SettingRow>
            </>
          ) : null}

          <SettingRow
            title={t("settings.network.ntp")}
            description={t("settings.network.ntpDesc")}
          >
            <TextField
              className="g-settings-short-field"
              value={settings.ntp}
              onValueChange={(value) => onUpdate("ntp", value)}
              ariaLabel={t("settings.network.ntp")}
              placeholder="pool.ntp.org"
              autoComplete="off"
            />
          </SettingRow>
        </SettingsGroup>

        <div className="g-settings-footer">
          <Button variant="text" onClick={() => onOpenChange(false)}>
            {t("settings.close")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="g-settings-group">
      <h2 className="g-settings-group-title">{title}</h2>
      <div className="g-settings-card">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
  stack = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  stack?: boolean;
}) {
  return (
    <div className="g-settings-row" data-stack={stack || undefined}>
      <div className="g-settings-row-copy">
        <div className="g-settings-row-title">{title}</div>
        {description ? <div className="g-settings-row-description">{description}</div> : null}
      </div>
      {children ? <div className="g-settings-row-control">{children}</div> : null}
    </div>
  );
}
