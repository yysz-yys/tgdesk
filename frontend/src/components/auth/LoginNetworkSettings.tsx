import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { SelectField } from "../ui/SelectField";
import { TextField } from "../ui/TextField";

type ProxyDraft = Pick<
  AppSettings,
  "proxyType" | "proxyHost" | "proxyPort" | "proxyUser" | "proxyPass"
>;

interface LoginNetworkSettingsProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onApply: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function draftFrom(settings: AppSettings): ProxyDraft {
  return {
    proxyType: settings.proxyType,
    proxyHost: settings.proxyHost,
    proxyPort: settings.proxyPort,
    proxyUser: settings.proxyUser,
    proxyPass: settings.proxyPass,
  };
}

/**
 * Proxy editor for sign-in. It is a modal so the 420px login card never grows
 * or scrolls when the fields appear. Edits stay local until Save, and the
 * caller restarts the QR flow after the new settings have rendered.
 */
export function LoginNetworkSettings({
  settings,
  onUpdate,
  onApply,
  open,
  onOpenChange,
}: LoginNetworkSettingsProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProxyDraft>(() => draftFrom(settings));

  useEffect(() => {
    if (open) {
      setDraft(draftFrom(settings));
    }
    // Reset only when opening; editing must not be overwritten by saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof ProxyDraft>(key: K, value: ProxyDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    onUpdate("proxyType", draft.proxyType);
    onUpdate("proxyHost", draft.proxyHost);
    onUpdate("proxyPort", draft.proxyPort);
    onUpdate("proxyUser", draft.proxyUser);
    onUpdate("proxyPass", draft.proxyPass);
    onOpenChange(false);
    // Let the settings render (and proxyRef update) before restarting the
    // network-dependent QR flow.
    window.setTimeout(onApply, 0);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("login.networkSettings")}
      description={t("login.networkDescription")}
      closeLabel={t("common.close")}
    >
      <div className="g-login-network">
        <SelectField
          label={t("settings.network.proxyType")}
          value={draft.proxyType}
          onValueChange={(value) =>
            set("proxyType", value as AppSettings["proxyType"])
          }
          options={[
            { value: "none", label: t("settings.network.none") },
            { value: "socks5", label: t("settings.network.socks5") },
            { value: "http", label: t("settings.network.http") },
          ]}
        />

        {draft.proxyType !== "none" ? (
          <>
            <div className="g-login-network-grid">
              <TextField
                label={t("settings.network.host")}
                value={draft.proxyHost}
                onValueChange={(value) => set("proxyHost", value)}
                placeholder="127.0.0.1"
                autoComplete="off"
              />
              <TextField
                label={t("settings.network.port")}
                value={draft.proxyPort}
                onValueChange={(value) => set("proxyPort", value)}
                placeholder="1080"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="g-login-network-grid">
              <TextField
                label={t("settings.network.username")}
                value={draft.proxyUser}
                onValueChange={(value) => set("proxyUser", value)}
                autoComplete="off"
              />
              <TextField
                label={t("settings.network.password")}
                type="password"
                value={draft.proxyPass}
                onValueChange={(value) => set("proxyPass", value)}
                autoComplete="off"
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="g-dialog-actions">
        <Button variant="text" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button variant="filled" icon="check" onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </Dialog>
  );
}
