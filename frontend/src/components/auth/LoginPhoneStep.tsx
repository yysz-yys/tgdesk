import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
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
      className="g-login-step"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="g-login-toolbar">
        <IconButton label={t("login.back")} icon="arrow_back" onClick={onBack} />
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

      <header className="g-login-heading">
        <h2>{t("login.phoneTitle")}</h2>
        <p>{t("login.phoneDescription")}</p>
      </header>

      <div className="g-login-phone-field">
        <CountryPicker
          value={country}
          onChange={onCountry}
          language={language}
          disabled={busy}
        />
        <input
          className="g-login-phone-input"
          value={phone}
          onChange={(event) => onPhone(event.target.value.replace(/[^\d\s-]/g, ""))}
          placeholder={t("login.phonePlaceholder")}
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus
          aria-label={t("login.phonePlaceholder")}
        />
      </div>

      <p className="g-login-phone-hint">
        {country ? t("login.phoneHint") : t("login.phoneHintCountry")}
        {phone.replace(/\D/g, "").length >= 5 && displayPhone ? (
          <span className="g-login-phone-preview">{displayPhone}</span>
        ) : null}
      </p>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Button
        type="submit"
        variant="filled"
        size="lg"
        fullWidth
        loading={busy}
        icon={busy ? undefined : "arrow_forward"}
        disabled={retryIn > 0 || !country}
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
