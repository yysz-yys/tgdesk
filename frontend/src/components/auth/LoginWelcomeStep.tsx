import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";

interface LoginWelcomeStepProps {
  busy?: boolean;
  onStart: () => void;
  onPhone: () => void;
  onLanguage: () => void;
  languageLabel: string;
  extra?: ReactNode;
}

export function LoginWelcomeStep({
  busy,
  onStart,
  onPhone,
  onLanguage,
  languageLabel,
  extra,
}: LoginWelcomeStepProps) {
  const { t } = useTranslation();

  return (
    <div className="tg-login-welcome">
      <h2>{t("login.welcomeTitle")}</h2>
      <p>{t("login.welcomeDescription")}</p>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={onStart}
        disabled={busy}
        className="tg-login-start"
      >
        {t("login.startMessaging")}
      </Button>

      <button type="button" className="tg-login-secondary-link" onClick={onPhone}>
        {t("login.phoneLogin")}
      </button>

      {extra}

      <div className="tg-login-welcome-footer">
        <button type="button" className="tg-login-language" onClick={onLanguage}>
          {languageLabel}
        </button>
      </div>
    </div>
  );
}
