import { useState } from "react";
import { IconArrowLeft, IconRefresh, IconSettings } from "@tabler/icons-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";
import { BrandMark } from "./BrandMark";
import { LoginNetworkSettings } from "./LoginNetworkSettings";
import type { AppSettings } from "../../hooks/useSettings";

interface LoginQrStepProps {
  qrUrl: string;
  secondsLeft: number;
  error: string;
  notice?: string;
  importError?: string;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onPhone: () => void;
  onBack: () => void;
  onRefresh: () => void;
  onApplyNetwork: () => void;
}

export function LoginQrStep({
  qrUrl,
  secondsLeft,
  error,
  notice,
  importError,
  settings,
  onUpdate,
  onPhone,
  onBack,
  onRefresh,
  onApplyNetwork,
}: LoginQrStepProps) {
  const { t } = useTranslation();
  const [networkOpen, setNetworkOpen] = useState(false);
  const expired = Boolean(qrUrl) && secondsLeft <= 0;

  return (
    <div className="tg-login-qr">
      <div className="tg-login-toolbar">
        <IconButton label={t("login.back")} onClick={onBack}>
          <IconArrowLeft size={20} />
        </IconButton>
        <button
          type="button"
          className="tg-login-toolbar-action"
          onClick={() => setNetworkOpen((current) => !current)}
          aria-expanded={networkOpen}
        >
          <IconSettings size={15} />
          {t("login.networkSettings")}
        </button>
      </div>

      <div className="tg-login-qr-body">
        <div className="tg-login-qr-shell" data-expired={expired || undefined}>
          {qrUrl ? (
            <>
              <QRCodeSVG
                value={qrUrl}
                size={180}
                level="M"
                bgColor="#ffffff"
                fgColor="#111111"
                marginSize={1}
                title={t("login.qrTitle")}
              />
              <span className="tg-login-qr-mark">
                <BrandMark size={36} />
              </span>
              {expired ? (
                <button type="button" className="tg-login-qr-expired" onClick={onRefresh}>
                  <IconRefresh size={17} />
                  {t("login.refreshQr")}
                </button>
              ) : null}
            </>
          ) : (
            <div className="tg-login-qr-placeholder">
              <Spinner size={24} />
              <span>{t("login.generatingQr")}</span>
            </div>
          )}
        </div>

        <h1 className="tg-login-qr-title">{t("login.qrHeading")}</h1>
        <p className="tg-login-qr-subtitle">{t("login.qrDescription")}</p>

        <ol className="tg-login-steps">
          <li>
            <span className="tg-login-step-num">1</span>
            <p>{t("login.qrStep1")}</p>
          </li>
          <li>
            <span className="tg-login-step-num">2</span>
            <p>{t("login.qrStep2")}</p>
          </li>
          <li>
            <span className="tg-login-step-num">3</span>
            <p>{t("login.qrStep3")}</p>
          </li>
        </ol>

        <div className="tg-login-qr-timer">
          {expired ? (
            <span className="tg-login-qr-timer-expired">{t("login.qrExpired")}</span>
          ) : qrUrl && secondsLeft > 0 ? (
            <span>{t("login.qrExpiresIn", { seconds: secondsLeft })}</span>
          ) : (
            <span>{t("login.qrRefreshHint")}</span>
          )}
        </div>

        {importError ? <Callout tone="error">{importError}</Callout> : null}
        {error ? <Callout tone="error">{error}</Callout> : null}
        {notice ? <Callout tone="info">{notice}</Callout> : null}

        <div className="tg-login-qr-links">
          <Button variant="link" onClick={onPhone}>
            {t("login.phoneLogin")}
          </Button>
        </div>
      </div>

      <LoginNetworkSettings
        open={networkOpen}
        onOpenChange={setNetworkOpen}
        settings={settings}
        onUpdate={onUpdate}
        onApply={onApplyNetwork}
      />
    </div>
  );
}
