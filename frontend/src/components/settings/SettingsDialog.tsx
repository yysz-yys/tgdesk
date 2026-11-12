import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { AppSettings } from "../../hooks/useSettings";
import "./settings-panel.css";
import "./settings-controls.css";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

// Only settings that the chat and download features actually use.
export function SettingsDialog({ open, onOpenChange, settings, onUpdate }: SettingsDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-overlay" />
        <Dialog.Content className="settings-sheet">
          <header className="settings-sheet-header">
            <Dialog.Title className="settings-sheet-title">{t("settings.title")}</Dialog.Title>
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
            <div className="settings-content">
              <SettingsGroup title={t("settings.nav.general")}>
                <SettingRow
                  title={t("settings.general.language")}
                  description={t("settings.general.languageDesc")}
                >
                  <SettingSelect
                    ariaLabel={t("settings.general.language")}
                    value={settings.language}
                    onValueChange={(value) =>
                      onUpdate("language", value as AppSettings["language"])
                    }
                    options={[
                      { value: "system", label: t("common.systemDefault") },
                      { value: "en", label: "English" },
                      { value: "zh", label: "简体中文" },
                      { value: "ja", label: "日本語" },
                    ]}
                  />
                </SettingRow>
              </SettingsGroup>

              <SettingsGroup title={t("settings.chat.title")}>
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

              <SettingsGroup title={t("settings.nav.downloads")}>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <div className="settings-row-title">{t("settings.downloads.folder")}</div>
                    <div className="settings-row-description path-value">
                      {settings.downloadDir}
                    </div>
                  </div>
                </div>
                <SettingRow
                  title={t("settings.downloads.threads")}
                  description={t("settings.downloads.threadsDesc", {
                    count: settings.threads,
                  })}
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
              </SettingsGroup>

              <SettingsGroup title={t("settings.nav.network")}>
                <SettingRow
                  title={t("settings.network.proxyType")}
                  description={t("settings.network.proxyTypeDesc")}
                >
                  <SettingSelect
                    ariaLabel={t("settings.network.proxyType")}
                    value={settings.proxyType}
                    onValueChange={(value) =>
                      onUpdate("proxyType", value as AppSettings["proxyType"])
                    }
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
                        <div className="settings-row-title">
                          {t("settings.network.hostPort")}
                        </div>
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

                <SettingRow title={t("settings.network.ntp")} description={t("settings.network.ntpDesc")}>
                  <input
                    className="settings-input"
                    value={settings.ntp}
                    onChange={(event) => onUpdate("ntp", event.target.value)}
                    placeholder="pool.ntp.org"
                    spellCheck={false}
                  />
                </SettingRow>
              </SettingsGroup>
            </div>
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
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="settings-row">
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
