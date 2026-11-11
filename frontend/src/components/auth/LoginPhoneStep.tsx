import { IconArrowLeft } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { SelectField } from "../ui/SelectField";
import { TextField } from "../ui/TextField";
import { Spinner } from "../ui/Spinner";

interface Country {
  code: string;
  region: string;
}

interface LoginPhoneStepProps {
  country: string;
  countries: Country[];
  countryName: (region: string, language: string) => string;
  language: string;
  phone: string;
  busy: boolean;
  error: string;
  onCountry: (value: string) => void;
  onPhone: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function LoginPhoneStep({
  country,
  countries,
  countryName,
  language,
  phone,
  busy,
  error,
  onCountry,
  onPhone,
  onSubmit,
  onBack,
}: LoginPhoneStepProps) {
  const { t } = useTranslation();

  return (
    <form
      className="tg-login-step"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <button type="button" className="tg-login-back" onClick={onBack}>
        <IconArrowLeft size={16} />
        {t("login.back")}
      </button>

      <header className="tg-login-heading">
        <span className="tg-login-eyebrow">{t("login.phoneEyebrow")}</span>
        <h2>{t("login.phoneTitle")}</h2>
        <p>{t("login.phoneDescription")}</p>
      </header>

      <div className="tg-login-phone-row">
        <SelectField
          className="tg-login-country"
          value={country}
          onChange={(event) => onCountry(event.target.value)}
          aria-label={t("login.country")}
        >
          {countries.map((item) => (
            <option value={item.code} key={item.code}>
              {item.code} {countryName(item.region, language)}
            </option>
          ))}
        </SelectField>
        <TextField
          value={phone}
          onChange={(event) => onPhone(event.target.value)}
          placeholder={t("login.phonePlaceholder")}
          inputMode="tel"
          autoFocus
          aria-label={t("login.phonePlaceholder")}
        />
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy}>
        {busy ? <Spinner size={17} /> : null}
        {busy ? t("login.signingIn") : t("login.continue")}
      </Button>

      <p className="tg-login-fineprint">{t("login.phoneFineprint")}</p>
    </form>
  );
}
