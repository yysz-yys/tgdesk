import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Callout, Icon, IconButton, TextField } from "../../ui";

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
  const [visible, setVisible] = useState(false);

  return (
    <form
      className="f-login-step"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <span className="f-login-mark">
        <Icon name="lock" size={20} />
      </span>

      <header className="f-login-heading f-login-heading-center">
        <h2>{t("login.passwordTitle")}</h2>
        <p>{t("login.passwordDescription")}</p>
      </header>

      {passwordHint ? (
        <div className="f-hint-row">
          <Icon name="key" size={16} />
          <span>{t("login.passwordHint", { hint: passwordHint })}</span>
        </div>
      ) : null}

      <TextField
        type={visible ? "text" : "password"}
        label={t("login.passwordPlaceholder")}
        value={password}
        onValueChange={onPassword}
        autoComplete="current-password"
        autoFocus
        trailing={
          <IconButton
            label={t(visible ? "login.hidePassword" : "login.showPassword")}
            icon={visible ? "visibility_off" : "visibility"}
            size="1"
            tooltip={false}
            onClick={() => setVisible((current) => !current)}
          />
        }
      />

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Button type="submit" size="3" fullWidth loading={busy} disabled={retryIn > 0}>
        {busy
          ? t("login.signingIn")
          : retryIn > 0
            ? t("login.retryIn", { seconds: retryIn })
            : t("login.continue")}
      </Button>

      <div className="f-login-links">
        <Button type="button" variant="ghost" size="1" onClick={onBack}>
          {t("login.startOver")}
        </Button>
      </div>
    </form>
  );
}
