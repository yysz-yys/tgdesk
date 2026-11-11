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
  busy: boolean;
  error: string;
  notice?: string;
  importError?: string;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onRefresh: () => void;
  onPhone: () => void;
  onPasskey: () => void;
  onBack: () => void;
  onApplyNetwork: () => void;
}

export function LoginQrStep({
  qrUrl,
  busy,
  error,
  notice,
  importError,
  settings,
  onUpdate,
  onRefresh,
  onPhone,
  onPasskey,
  onBack,
  onApplyNetwork,
}: LoginQrStepProps) {
  const { t } = useTranslation();
  const [networkOpen, setNetworkOpen] = useState(false);

  return (
    <div className="tg-login-qr">
      <div className="tg-login-qr-toolbar">
        <IconButton label={t("login.back")} onClick={onBack}>
          <IconArrowLeft size={21} />
        </IconButton>
        <IconButton
          label={t("login.networkSettings")}
          onClick={() => setNetworkOpen((current) => !current)}
          active={networkOpen}
        >
          <IconSettings size={21} />
        </IconButton>
      </div>

      <div className="tg-login-qr-body">
        <div className="tg-login-qr-shell">
          {qrUrl ? (
            <>
              <QRCodeSVG
                value={qrUrl}
                size={204}
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
            <span>1</span>
            <p>{t("login.qrStep1")}</p>
          </li>
          <li>
            <span>2</span>
            <p>{t("login.qrStep2")}</p>
          </li>
          <li>
            <span>3</span>
            <p>{t("login.qrStep3")}</p>
          </li>
        </ol>

        {importError ? <Callout tone="error">{importError}</Callout> : null}
        {error ? <Callout tone="error">{error}</Callout> : null}
        {notice ? <Callout tone="info">{notice}</Callout> : null}

        <div className="tg-login-qr-links">
          <Button variant="link" onClick={onPhone}>
            {t("login.phoneLogin")}
          </Button>
          <Button variant="link" onClick={onPasskey}>
            {t("login.passkeyLogin")}
          </Button>
        </div>

        <button type="button" className="tg-login-refresh" onClick={onRefresh} disabled={busy}>
          <IconRefresh size={14} />
          {t("login.refreshQr")}
        </button>
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
