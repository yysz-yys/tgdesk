import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { BrandMark } from "./BrandMark";
import { LoginNetworkSettings } from "./LoginNetworkSettings";

interface LoginQrStepProps {
  qrUrl: string;
  secondsLeft: number;
  busy?: boolean;
  error: string;
  notice?: string;
  importError?: string;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onPhone: () => void;
  onRefresh: () => void;
  onApplyNetwork: () => void;
}

export function LoginQrStep({
  qrUrl,
  secondsLeft,
  busy = false,
  error,
  notice,
  importError,
  settings,
  onUpdate,
  onPhone,
  onRefresh,
  onApplyNetwork,
}: LoginQrStepProps) {
  const { t } = useTranslation();
  const [networkOpen, setNetworkOpen] = useState(false);
  const expired = Boolean(qrUrl) && secondsLeft <= 0;

  return (
    <div className="g-login-step g-login-qr">
      <div className="g-login-toolbar g-login-toolbar--end">
        <button
          type="button"
          className="g-login-toolbar-action"
          onClick={onRefresh}
          disabled={busy}
        >
          <Icon name="refresh" size={17} />
          {t("login.refresh")}
        </button>
        <button
          type="button"
          className="g-login-toolbar-action"
          onClick={() => setNetworkOpen((current) => !current)}
          aria-expanded={networkOpen}
        >
          <Icon name="tune" size={17} />
          {t("login.networkSettings")}
        </button>
      </div>

      <LoginNetworkSettings
        open={networkOpen}
        onOpenChange={setNetworkOpen}
        settings={settings}
        onUpdate={onUpdate}
        onApply={onApplyNetwork}
      />

      <div className="g-login-qr-body">
        <header className="g-login-heading g-login-heading-center">
          <h2>{t("login.qrHeading")}</h2>
          <p>{t("login.scanHint")}</p>
        </header>

        <div className="g-login-qr-shell" data-expired={expired || undefined}>
          {qrUrl ? (
            <>
              <QRCodeSVG
                value={qrUrl}
                size={188}
                level="M"
                bgColor="#ffffff"
                fgColor="#1f1f1f"
                marginSize={1}
                title={t("login.qrTitle")}
              />
              <span className="g-login-qr-mark" aria-hidden="true">
                <BrandMark size={34} alt="" />
              </span>
              {expired ? (
                <button type="button" className="g-login-qr-expired" onClick={onRefresh}>
                  <Icon name="refresh" size={18} />
                  {t("login.refreshQr")}
                </button>
              ) : null}
            </>
          ) : (
            <div className="g-login-qr-placeholder">
              <Spinner size={26} label={t("login.generatingQr")} />
              <span>{t("login.generatingQr")}</span>
            </div>
          )}
        </div>

        <div className="g-login-status-chip" data-expired={expired || undefined}>
          <Icon name={expired ? "timer_off" : "schedule"} size={17} />
          {expired ? (
            <span>{t("login.qrExpired")}</span>
          ) : !qrUrl ? (
            <span>{t("login.connecting")}</span>
          ) : secondsLeft > 0 ? (
            <span>{t("login.qrExpiresIn", { seconds: secondsLeft })}</span>
          ) : (
            <span>{t("login.qrRefreshHint")}</span>
          )}
        </div>
        {importError ? <Callout tone="error">{importError}</Callout> : null}
        {error ? <Callout tone="error">{error}</Callout> : null}
        {notice ? <Callout tone="info">{notice}</Callout> : null}

        <Button variant="text" icon="smartphone" onClick={onPhone}>
          {t("login.phoneLogin")}
        </Button>
      </div>
    </div>
  );
}
