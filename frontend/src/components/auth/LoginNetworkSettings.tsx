import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { SelectField } from "../ui/SelectField";
import { TextField } from "../ui/TextField";

interface LoginNetworkSettingsProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onApply: () => void;
  open: boolean;
}

/**
 * Inline proxy editor used by both sign-in steps. The toolbar owns the
 * disclosure button, so the panel intentionally has no second summary row.
 */
export function LoginNetworkSettings({
  settings,
  onUpdate,
  onApply,
  open,
}: LoginNetworkSettingsProps) {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return (
    <div className="g-login-network g-login-network--inline">
      <div className="g-login-network-body">
        <p className="g-login-network-hint">{t("login.networkHint")}</p>
        <SelectField
          label={t("settings.network.proxyType")}
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

        {settings.proxyType !== "none" ? (
          <>
            <div className="g-login-network-grid">
              <TextField
                label={t("settings.network.host")}
                value={settings.proxyHost}
                onValueChange={(value) => onUpdate("proxyHost", value)}
                placeholder="127.0.0.1"
                autoComplete="off"
              />
              <TextField
                label={t("settings.network.port")}
                value={settings.proxyPort}
                onValueChange={(value) => onUpdate("proxyPort", value)}
                placeholder="1080"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="g-login-network-grid">
              <TextField
                label={t("settings.network.username")}
                value={settings.proxyUser}
                onValueChange={(value) => onUpdate("proxyUser", value)}
                autoComplete="off"
              />
              <TextField
                label={t("settings.network.password")}
                type="password"
                value={settings.proxyPass}
                onValueChange={(value) => onUpdate("proxyPass", value)}
                autoComplete="off"
              />
            </div>
          </>
        ) : null}

        <Button variant="tonal" size="sm" icon="sync" onClick={onApply}>
          {t("login.applyNetwork")}
        </Button>
      </div>
    </div>
  );
}
