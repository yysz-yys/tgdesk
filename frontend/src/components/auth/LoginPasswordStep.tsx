import { IconShieldLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { TextField } from "../ui/TextField";
import { Spinner } from "../ui/Spinner";

interface LoginPasswordStepProps {
  password: string;
  passwordHint: string;
  retryIn: number;
  busy: boolean;
  error: string;
  onPassword: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function LoginPasswordStep({
  password,
  passwordHint,
  retryIn,
  busy,
  error,
  onPassword,
  onSubmit,
  onBack,
}: LoginPasswordStepProps) {
  const { t } = useTranslation();

  return (
    <form
      className="tg-login-step"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <span className="tg-login-lock">
        <IconShieldLock size={22} />
      </span>

      <header className="tg-login-heading tg-login-heading-center">
        <span className="tg-login-eyebrow">{t("login.codeEyebrow")}</span>
        <h2>{t("login.passwordTitle")}</h2>
        <p>{t("login.passwordDescription")}</p>
      </header>

      {passwordHint ? (
        <p className="tg-login-password-hint">
          {t("login.passwordHint", { hint: passwordHint })}
        </p>
      ) : null}

      <TextField
        type="password"
        value={password}
        onChange={(event) => onPassword(event.target.value)}
        placeholder={t("login.passwordPlaceholder")}
        autoComplete="current-password"
        autoFocus
        aria-label={t("login.passwordPlaceholder")}
      />

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

      <button type="button" className="tg-login-text-link" onClick={onBack}>
        {t("login.startOver")}
      </button>
    </form>
  );
}
