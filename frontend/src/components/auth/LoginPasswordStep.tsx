import { IconShieldLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { TextField } from "../ui/TextField";
import { Spinner } from "../ui/Spinner";

interface LoginPasswordStepProps {
  password: string;
  busy: boolean;
  error: string;
  onPassword: (value: string) => void;
  onSubmit: () => void;
}

export function LoginPasswordStep({
  password,
  busy,
  error,
  onPassword,
  onSubmit,
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
        <h2>{t("login.passwordTitle")}</h2>
        <p>{t("login.passwordDescription")}</p>
      </header>

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

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy}>
        {busy ? <Spinner size={17} /> : null}
        {busy ? t("login.signingIn") : t("login.continue")}
      </Button>
    </form>
  );
}
