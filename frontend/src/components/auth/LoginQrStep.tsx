import { useState } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
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
  error: string;
  notice?: string;
  importError?: string;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onPhone: () => void;
  onPasskey: () => void;
  onBack: () => void;
  onApplyNetwork: () => void;
}

export function LoginQrStep({
  qrUrl,
  error,
  notice,
  importError,
  settings,
  onUpdate,
  onPhone,
  onPasskey,
  onBack,
  onApplyNetwork,
}: LoginQrStepProps) {
  const { t } = useTranslation();
  const [networkOpen, setNetworkOpen] = useState(false);
  const [updateNote, setUpdateNote] = useState(false);

  return (
    <div className="tg-login-qr">
      <div className="tg-login-qr-toolbar">
        <IconButton label={t("login.back")} onClick={onBack}>
          <IconArrowLeft size={21} />
        </IconButton>
        <div className="tg-login-top-actions">
          <button type="button" onClick={() => setUpdateNote(true)}>
            {t("login.update")}
          </button>
          <button
            type="button"
            onClick={() => setNetworkOpen((current) => !current)}
          >
            {t("login.settings")}
          </button>
        </div>
      </div>

      <div className="tg-login-qr-body">
        <div className="tg-login-qr-shell">
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
                <BrandMark size={34} />
              </span>
            </>
          ) : (
            <div className="tg-login-qr-placeholder">
              <Spinner size={24} />
              <span>{t("login.generatingQr")}</span>
            </div>
          )}
        </div>

        <h1 className="tg-login-qr-title">{t("login.qrHeading")}</h1>

        <ol className="tg-login-steps">
          <li>
            <span className="tg-login-step-num">1.</span>
            <p>{t("login.qrStep1")}</p>
          </li>
          <li>
            <span className="tg-login-step-num">2.</span>
            <p>{t("login.qrStep2")}</p>
          </li>
          <li>
            <span className="tg-login-step-num">3.</span>
            <p>{t("login.qrStep3")}</p>
          </li>
        </ol>

        {importError ? <Callout tone="error">{importError}</Callout> : null}
        {error ? <Callout tone="error">{error}</Callout> : null}
        {notice ? <Callout tone="info">{notice}</Callout> : null}
        {updateNote ? <Callout tone="info">{t("login.updateSoon")}</Callout> : null}

        <div className="tg-login-qr-links">
          <Button variant="link" onClick={onPhone}>
            {t("login.phoneLogin")}
          </Button>
          <Button variant="link" onClick={onPasskey}>
            {t("login.passkeyLogin")}
          </Button>
        </div>
      </div>

      {networkOpen ? (
        <LoginNetworkSettings
          open
          onOpenChange={setNetworkOpen}
          settings={settings}
          onUpdate={onUpdate}
          onApply={onApplyNetwork}
        />
      ) : null}
    </div>
  );
}
