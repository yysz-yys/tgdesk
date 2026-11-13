import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import { Button, Dialog, SelectField, TextField } from "../../ui";

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
 * Proxy editor for sign-in. A modal keeps the login card from growing or
 * scrolling; edits stay local until Save and the caller restarts the QR flow
 * after the new settings render.
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
      <div className="f-network">
        <SelectField
          size="2"
          label={t("settings.network.proxyType")}
          value={draft.proxyType}
          onValueChange={(value) => set("proxyType", value as AppSettings["proxyType"])}
          options={[
            { value: "none", label: t("settings.network.none") },
            { value: "socks5", label: t("settings.network.socks5") },
            { value: "http", label: t("settings.network.http") },
          ]}
        />

        {draft.proxyType !== "none" ? (
          <>
            <div className="f-network-grid">
              <TextField
                size="2"
                label={t("settings.network.host")}
                value={draft.proxyHost}
                onValueChange={(value) => set("proxyHost", value)}
                placeholder="127.0.0.1"
                autoComplete="off"
              />
              <TextField
                size="2"
                label={t("settings.network.port")}
                value={draft.proxyPort}
                onValueChange={(value) => set("proxyPort", value)}
                placeholder="1080"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="f-network-grid">
              <TextField
                size="2"
                label={t("settings.network.username")}
                value={draft.proxyUser}
                onValueChange={(value) => set("proxyUser", value)}
                autoComplete="off"
              />
              <TextField
                size="2"
                type="password"
                label={t("settings.network.password")}
                value={draft.proxyPass}
                onValueChange={(value) => set("proxyPass", value)}
                autoComplete="off"
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="f-dialog-actions">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button variant="solid" icon="check" onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </Dialog>
  );
}
