import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { BrandMark } from "./BrandMark";

interface LoginWelcomeStepProps {
  busy?: boolean;
  onStart: () => void;
  onLanguage: () => void;
  languageLabel: string;
  extra?: ReactNode;
}

export function LoginWelcomeStep({
  busy,
  onStart,
  onLanguage,
  languageLabel,
  extra,
}: LoginWelcomeStepProps) {
  const { t } = useTranslation();

  return (
    <div className="tg-login-welcome">
      <BrandMark size={88} />
      <h1>{t("login.welcomeTitle")}</h1>
      <p>{t("login.welcomeDescription")}</p>
      <Button variant="primary" size="lg" onClick={onStart} disabled={busy} className="tg-login-start">
        {t("login.startMessaging")}
      </Button>
      <button type="button" className="tg-login-language" onClick={onLanguage}>
        {languageLabel}
      </button>
      {extra}
    </div>
  );
}
