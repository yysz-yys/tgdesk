import { IconArrowLeft, IconMessageDots, IconPhone } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";

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
  const Icon = codeInfo.type === "call" || codeInfo.type === "missed_call" ? IconPhone : IconMessageDots;

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

      <div className="tg-login-code-hint">
        <span className="tg-login-code-hint-icon">
          <Icon size={17} />
        </span>
        <span>{t(hintKey)}</span>
      </div>

      <input
        className="tg-login-code tg-input"
        value={code}
        onChange={(event) => onCode(event.target.value)}
        placeholder={Array.from({ length }, () => "•").join(" ")}
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

      <div className="tg-login-code-actions">
        <button
          type="button"
          className="tg-login-text-link"
          onClick={onResend}
          disabled={resendIn > 0 || busy}
        >
          {resendIn > 0
            ? t("login.resendIn", { seconds: resendIn })
            : t("login.resendCode")}
        </button>
        <span className="tg-login-action-divider" />
        <button type="button" className="tg-login-text-link" onClick={onBack}>
          {t("login.startOver")}
        </button>
      </div>
    </form>
  );
}
