import { IconChevronDown } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { SelectField } from "../ui/SelectField";
import { TextField } from "../ui/TextField";
import type { AppSettings } from "../../hooks/useSettings";

interface LoginNetworkSettingsProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onApply: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LoginNetworkSettings({
  settings,
  onUpdate,
  onApply,
  open,
  onOpenChange,
}: LoginNetworkSettingsProps) {
  const { t } = useTranslation();

  return (
    <details
      className="tg-login-network"
      open={open}
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
    >
      <summary>
        <span>{t("login.networkSettings")}</span>
        <IconChevronDown size={15} stroke={1.8} />
      </summary>
      <div className="tg-login-network-body">
        <p className="tg-login-network-hint">{t("login.networkHint")}</p>
        <SelectField
          label={t("settings.network.proxyType")}
          value={settings.proxyType}
          onChange={(event) =>
            onUpdate("proxyType", event.target.value as AppSettings["proxyType"])
          }
        >
          <option value="none">{t("settings.network.none")}</option>
          <option value="socks5">{t("settings.network.socks5")}</option>
          <option value="http">{t("settings.network.http")}</option>
        </SelectField>

        {settings.proxyType !== "none" ? (
          <>
            <div className="tg-login-network-grid">
              <TextField
                label={t("settings.network.host")}
                value={settings.proxyHost}
                onChange={(event) => onUpdate("proxyHost", event.target.value)}
                placeholder="127.0.0.1"
                spellCheck={false}
              />
              <TextField
                label={t("settings.network.port")}
                value={settings.proxyPort}
                onChange={(event) => onUpdate("proxyPort", event.target.value)}
                placeholder="1080"
                inputMode="numeric"
              />
            </div>
            <div className="tg-login-network-grid">
              <TextField
                label={t("settings.network.username")}
                value={settings.proxyUser}
                onChange={(event) => onUpdate("proxyUser", event.target.value)}
                spellCheck={false}
              />
              <TextField
                label={t("settings.network.password")}
                type="password"
                value={settings.proxyPass}
                onChange={(event) => onUpdate("proxyPass", event.target.value)}
              />
            </div>
          </>
        ) : null}

        <Button variant="secondary" size="sm" onClick={onApply}>
          {t("login.applyNetwork")}
        </Button>
      </div>
    </details>
  );
}
