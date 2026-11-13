import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import { Button, Callout, IconButton } from "../../ui";
import { CountryPicker } from "./CountryPicker";
import { LoginNetworkSettings } from "./LoginNetworkSettings";

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
      className="f-login-step"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="f-login-toolbar">
        <IconButton label={t("login.back")} icon="arrow_back" size="1" onClick={onBack} />
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

      <header className="f-login-heading">
        <h2>{t("login.phoneTitle")}</h2>
        <p>{t("login.phoneDescription")}</p>
      </header>

      <div className="f-phone-field">
        <CountryPicker
          value={country}
          onChange={onCountry}
          language={language}
          disabled={busy}
        />
        <span className="f-phone-divider" aria-hidden="true" />
        <input
          className="f-phone-input"
          value={phone}
          onChange={(event) => onPhone(event.target.value.replace(/[^\d\s-]/g, ""))}
          placeholder={t("login.phonePlaceholder")}
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus
          aria-label={t("login.phonePlaceholder")}
        />
      </div>

      <p className="f-login-hint">
        {country ? t("login.phoneHint") : t("login.phoneHintCountry")}
        {phone.replace(/\D/g, "").length >= 5 && displayPhone ? (
          <span className="f-phone-preview">{displayPhone}</span>
        ) : null}
      </p>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Button
        type="submit"
        size="3"
        fullWidth
        loading={busy}
        disabled={retryIn > 0 || !country}
        trailingIcon={busy ? undefined : "arrow_forward"}
      >
        {busy
          ? t("login.signingIn")
          : retryIn > 0
            ? t("login.retryIn", { seconds: retryIn })
            : t("login.continue")}
      </Button>
    </form>
  );
}
