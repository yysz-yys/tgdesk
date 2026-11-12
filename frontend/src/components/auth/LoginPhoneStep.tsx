import { IconArrowLeft, IconSettings } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";
import { CountryPicker } from "./CountryPicker";
import { LoginNetworkSettings } from "./LoginNetworkSettings";
import type { AppSettings } from "../../hooks/useSettings";
import { useState } from "react";

interface LoginPhoneStepProps {
  country: string;
  language: string;
  phone: string;
  displayPhone: string;
  busy: boolean;
  error: string;
  retryIn: number;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onCountry: (value: string) => void;
  onPhone: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onApplyNetwork: () => void;
}

export function LoginPhoneStep({
  country,
  language,
  phone,
  displayPhone,
  busy,
  error,
  retryIn,
  settings,
  onUpdate,
  onCountry,
  onPhone,
  onSubmit,
  onBack,
  onApplyNetwork,
}: LoginPhoneStepProps) {
  const { t } = useTranslation();
  const [networkOpen, setNetworkOpen] = useState(false);

  return (
    <form
      className="tg-login-step"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="tg-login-toolbar">
        <button type="button" className="tg-login-back" onClick={onBack}>
          <IconArrowLeft size={16} />
          {t("login.back")}
        </button>
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

      <header className="tg-login-heading">
        <span className="tg-login-eyebrow">{t("login.phoneEyebrow")}</span>
        <h2>{t("login.phoneTitle")}</h2>
        <p>{t("login.phoneDescription")}</p>
      </header>

      <div className="tg-login-phone-field">
        <CountryPicker value={country} onChange={onCountry} language={language} disabled={busy} />
        <input
          className="tg-login-phone-input"
          value={phone}
          onChange={(event) => onPhone(event.target.value.replace(/[^\d\s-]/g, ""))}
          placeholder={t("login.phonePlaceholder")}
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus
          aria-label={t("login.phonePlaceholder")}
        />
      </div>

      <p className="tg-login-phone-hint">
        {t("login.phoneHint")}
        {phone.replace(/\D/g, "").length >= 5 ? (
          <span className="tg-login-phone-preview">{displayPhone}</span>
        ) : null}
      </p>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={busy || retryIn > 0}
      >
        {busy ? <Spinner size={17} /> : null}
        {busy
          ? t("login.signingIn")
          : retryIn > 0
            ? t("login.retryIn", { seconds: retryIn })
            : t("login.continue")}
      </Button>

      <p className="tg-login-fineprint">{t("login.phoneFineprint")}</p>

      <LoginNetworkSettings
        open={networkOpen}
        onOpenChange={setNetworkOpen}
        settings={settings}
        onUpdate={onUpdate}
        onApply={onApplyNetwork}
      />
    </form>
  );
}
