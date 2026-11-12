import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";

interface CodeInfo {
  type: string;
  length: number;
  timeout: number;
  resent: boolean;
}

interface LoginCodeStepProps {
  phone: string;
  code: string;
  codeInfo: CodeInfo;
  resendIn: number;
  retryIn: number;
  busy: boolean;
  error: string;
  notice: string;
  onCode: (value: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onBack: () => void;
}

export function LoginCodeStep({
  phone,
  code,
  codeInfo,
  resendIn,
  retryIn,
  busy,
  error,
  notice,
  onCode,
  onSubmit,
  onResend,
  onBack,
}: LoginCodeStepProps) {
  const { t } = useTranslation();
  const length = codeInfo.length > 0 && codeInfo.length <= 8 ? codeInfo.length : 6;
  const hintKey = (() => {
    switch (codeInfo.type) {
      case "app":
        return "login.codeTypeApp";
      case "sms":
        return "login.codeTypeSms";
      case "call":
        return "login.codeTypeCall";
      case "flash_call":
        return "login.codeTypeFlashCall";
      case "missed_call":
        return "login.codeTypeMissedCall";
      case "email":
        return "login.codeTypeEmail";
      default:
        return "login.codeTypeGeneric";
    }
  })();
  const hintIcon =
    codeInfo.type === "call" || codeInfo.type === "missed_call" ? "call" : "sms";

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
      </div>

      <header className="g-login-heading">
        <h2>{t("login.codeTitle")}</h2>
        <p>{t("login.codeSent", { phone })}</p>
      </header>

      <div className="g-login-code-hint">
        <span className="g-login-code-hint-icon">
          <Icon name={hintIcon} size={18} />
        </span>
        <span>{t(hintKey)}</span>
      </div>

      <input
        className="g-login-code"
        value={code}
        onChange={(event) => onCode(event.target.value)}
        placeholder={"•".repeat(length).split("").join(" ")}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        aria-label={t("login.codeTitle")}
      />

      {error ? <Callout tone="error">{error}</Callout> : null}
      {notice ? <Callout tone="info">{notice}</Callout> : null}

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

      <div className="g-login-code-actions">
        <button
          type="button"
          className="g-login-text-link"
          onClick={onResend}
          disabled={resendIn > 0 || busy}
        >
          {resendIn > 0
            ? t("login.resendIn", { seconds: resendIn })
            : t("login.resendCode")}
        </button>
        <span className="g-login-action-divider" />
        <button type="button" className="g-login-text-link" onClick={onBack}>
          {t("login.startOver")}
        </button>
      </div>
    </form>
  );
}
