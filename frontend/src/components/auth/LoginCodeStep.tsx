import { TextField as RadixTextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { Button, Callout, Icon, IconButton } from "../../ui";

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
      className="f-login-step"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="f-login-toolbar">
        <IconButton label={t("login.back")} icon="arrow_back" size="1" onClick={onBack} />
      </div>

      <header className="f-login-heading">
        <h2>{t("login.codeTitle")}</h2>
        <p>{t("login.codeSent", { phone })}</p>
      </header>

      <div className="f-hint-row">
        <Icon name={hintIcon} size={16} />
        <span>{t(hintKey)}</span>
      </div>

      <RadixTextField.Root
        className="f-otp"
        value={code}
        onChange={(event) => onCode(event.target.value)}
        placeholder={"•".repeat(length)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        aria-label={t("login.codeTitle")}
        size="3"
      />

      {error ? <Callout tone="error">{error}</Callout> : null}
      {notice ? <Callout tone="info">{notice}</Callout> : null}

      <Button type="submit" size="3" fullWidth loading={busy} disabled={retryIn > 0}>
        {busy
          ? t("login.signingIn")
          : retryIn > 0
            ? t("login.retryIn", { seconds: retryIn })
            : t("login.continue")}
      </Button>

      <div className="f-login-links">
        <Button
          type="button"
          variant="ghost"
          size="1"
          onClick={onResend}
          disabled={resendIn > 0 || busy}
        >
          {resendIn > 0 ? t("login.resendIn", { seconds: resendIn }) : t("login.resendCode")}
        </Button>
        <span className="f-footer-dot" />
        <Button type="button" variant="ghost" size="1" onClick={onBack}>
          {t("login.startOver")}
        </Button>
      </div>
    </form>
  );
}
