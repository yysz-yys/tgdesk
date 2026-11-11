import { IconArrowLeft } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";

interface LoginCodeStepProps {
  phone: string;
  code: string;
  busy: boolean;
  error: string;
  onCode: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function LoginCodeStep({
  phone,
  code,
  busy,
  error,
  onCode,
  onSubmit,
  onBack,
}: LoginCodeStepProps) {
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
        <span className="tg-login-eyebrow">{t("login.codeEyebrow")}</span>
        <h2>{t("login.codeTitle")}</h2>
        <p>{t("login.codeSent", { phone })}</p>
      </header>

      <input
        className="tg-login-code tg-input"
        value={code}
        onChange={(event) => onCode(event.target.value)}
        placeholder={t("login.codePlaceholder")}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        aria-label={t("login.codeTitle")}
      />

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy}>
        {busy ? <Spinner size={17} /> : null}
        {busy ? t("login.signingIn") : t("login.continue")}
      </Button>

      <button type="button" className="tg-login-text-link" onClick={onBack}>
        {t("login.startOver")}
      </button>
    </form>
  );
}
