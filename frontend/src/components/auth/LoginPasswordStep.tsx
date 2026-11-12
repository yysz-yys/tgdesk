import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/TextField";

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
      className="g-login-step"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <span className="g-login-lock">
        <Icon name="lock" size={22} />
      </span>

      <header className="g-login-heading g-login-heading-center">
        <h2>{t("login.passwordTitle")}</h2>
        <p>{t("login.passwordDescription")}</p>
      </header>

      {passwordHint ? (
        <div className="g-login-code-hint">
          <span className="g-login-code-hint-icon">
            <Icon name="key" size={18} />
          </span>
          <span>{t("login.passwordHint", { hint: passwordHint })}</span>
        </div>
      ) : null}

      <TextField
        type="password"
        label={t("login.passwordPlaceholder")}
        value={password}
        onValueChange={onPassword}
        autoComplete="current-password"
        autoFocus
      />

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Button
        type="submit"
        variant="filled"
        size="lg"
        fullWidth
        loading={busy}
        disabled={retryIn > 0}
      >
        {busy
          ? t("login.signingIn")
          : retryIn > 0
            ? t("login.retryIn", { seconds: retryIn })
            : t("login.continue")}
      </Button>

      <button type="button" className="g-login-text-link" onClick={onBack}>
        {t("login.startOver")}
      </button>
    </form>
  );
}
