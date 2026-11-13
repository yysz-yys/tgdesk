import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import { BrandMark } from "./BrandMark";
import { LoginNetworkSettings } from "./LoginNetworkSettings";
import { Button, Callout, Icon, Spinner } from "../../ui";

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
    <div className="f-login-step">
      <div className="f-login-toolbar f-login-toolbar-end">
        <Button variant="ghost" size="1" icon="refresh" onClick={onRefresh} disabled={busy}>
          {t("login.refresh")}
        </Button>
        <Button
          variant="ghost"
          size="1"
          icon="tune"
          onClick={() => setNetworkOpen((current) => !current)}
          aria-expanded={networkOpen}
        >
          {t("login.networkSettings")}
        </Button>
      </div>

      <LoginNetworkSettings
        open={networkOpen}
        onOpenChange={setNetworkOpen}
        settings={settings}
        onUpdate={onUpdate}
        onApply={onApplyNetwork}
      />

      <header className="f-login-heading f-login-heading-center">
        <h2>{t("login.qrHeading")}</h2>
        <p>{t("login.scanHint")}</p>
      </header>

      <div className="f-qr" data-expired={expired || undefined}>
        <div className="f-qr-code">
          {qrUrl ? (
            <>
              <QRCodeSVG
                value={qrUrl}
                size={200}
                level="H"
                bgColor="#ffffff"
                fgColor="#1c2024"
                marginSize={1}
                title={t("login.qrTitle")}
              />
              {!expired ? (
                <span className="f-qr-mark" aria-hidden="true">
                  <BrandMark size={28} alt="" />
                </span>
              ) : null}
            </>
          ) : (
            <div className="f-qr-placeholder">
              <Spinner size={20} label={t("login.generatingQr")} />
              <span>{t("login.generatingQr")}</span>
            </div>
          )}
        </div>
        {expired ? (
          <div className="f-qr-expired">
            <Button size="2" icon="refresh" onClick={onRefresh}>
              {t("login.refreshQr")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="f-qr-status" data-expired={expired || undefined}>
        <Icon name={expired ? "timer_off" : "schedule"} size={14} />
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

      <Button
        className="f-login-alt"
        variant="ghost"
        size="2"
        icon="smartphone"
        onClick={onPhone}
      >
        {t("login.phoneLogin")}
      </Button>
    </div>
  );
}
