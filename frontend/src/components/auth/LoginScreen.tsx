import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Events } from "@wailsio/runtime";
import { Service as AppService } from "../../../bindings/tgdesk/internal/app";
import type { TDataExport } from "../../../bindings/tgdesk/internal/kernel/models";
import type { AppSettings } from "../../hooks/useSettings";
import type { AuthEvent, AuthUser } from "../../types";
import { findCountry } from "../../data/countries";
import { LoginShell } from "./LoginShell";
import { LoginQrStep } from "./LoginQrStep";
import { LoginPhoneStep } from "./LoginPhoneStep";
import { LoginCodeStep } from "./LoginCodeStep";
import { LoginPasswordStep } from "./LoginPasswordStep";
import { LoginSuccessStep } from "./LoginSuccessStep";
import "./login.css";

type Mode = "qr" | "phone" | "code" | "password" | "success";

interface CodeInfo {
  type: string;
  length: number;
  timeout: number;
  resent: boolean;
}

interface LoginScreenProps {
  onAuthenticated: (user: AuthUser) => void;
  proxy?: string;
  ntp?: string;
  importError?: string;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

export function LoginScreen({
  onAuthenticated,
  proxy = "",
  ntp = "",
  importError = "",
  settings,
  onUpdate,
}: LoginScreenProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const [mode, setMode] = useState<Mode>("qr");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState(0);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0);
  const [codeInfo, setCodeInfo] = useState<CodeInfo>({
    type: "unknown",
    length: 0,
    timeout: 0,
    resent: false,
  });
  const [resendIn, setResendIn] = useState(0);
  const [retryIn, setRetryIn] = useState(0);
  const [passwordHint, setPasswordHint] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tdata, setTdata] = useState<TDataExport | null>(null);
  const [tdataError, setTdataError] = useState("");
  const proxyRef = useRef(proxy);
  const ntpRef = useRef(ntp);
  const qrUrlRef = useRef("");
  const phoneRef = useRef("");
  const modeRef = useRef<Mode>("qr");
  const autoCodeRef = useRef("");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    proxyRef.current = proxy;
    ntpRef.current = ntp;
  }, [proxy, ntp]);

  useEffect(() => {
    if (mode !== "success" || !user) {
      return;
    }
    const timer = window.setTimeout(() => onAuthenticated(user), 1500);
    return () => window.clearTimeout(timer);
  }, [mode, user, onAuthenticated]);

  // QR token countdown. Telegram rotates the token automatically; the backend
  // emits a fresh "qr" event before/at expiry.
  useEffect(() => {
    if (mode !== "qr" || !qrExpiresAt) {
      setQrSecondsLeft(0);
      return;
    }
    const update = () => {
      const left = Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000));
      setQrSecondsLeft(left);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [mode, qrExpiresAt]);

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setResendIn((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn > 0]);

  useEffect(() => {
    if (retryIn <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setRetryIn((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryIn > 0]);

  const localizeError = useCallback(
    (codeValue: string | undefined, message: string, retryAfter = 0) => {
      switch (codeValue) {
        case "FLOOD_WAIT":
          return t("login.errors.floodWait", { seconds: retryAfter });
        case "PHONE_NUMBER_INVALID":
          return t("login.errors.phone");
        case "PHONE_NUMBER_BANNED":
          return t("login.errors.banned");
        case "PHONE_NUMBER_UNOCCUPIED":
          return t("login.errors.unoccupied");
        case "PHONE_CODE_INVALID":
        case "PHONE_CODE_EMPTY":
          return t("login.errors.codeInvalid");
        case "PHONE_CODE_EXPIRED":
        case "PHONE_CODE_HASH_EXPIRED":
          return t("login.errors.codeExpired");
        case "SEND_CODE_UNAVAILABLE":
          return t("login.errors.codeUnavailable");
        case "PASSWORD_HASH_INVALID":
          return t("login.errors.passwordInvalid");
        case "SESSION_PASSWORD_NEEDED":
          return t("login.errors.passwordNeeded");
        case "AUTH_KEY_UNREGISTERED":
        case "SESSION_REVOKED":
        case "USER_DEACTIVATED":
        case "USER_DEACTIVATED_BAN":
          return t("login.errors.sessionExpired");
        case "NETWORK":
          return t("login.errors.timeout");
        case "STORAGE":
          return t("login.errors.storage");
        case "TDATA":
          return t("login.errors.tdata");
        case "CANCELLED":
          return "";
        case "TOO_MANY_CODES":
          return t("login.errors.tooManyCodes");
        case "TOO_MANY_PASSWORDS":
          return t("login.errors.tooManyPasswords");
        default:
          break;
      }
      if (retryAfter > 0) {
        return t("login.errors.floodWait", { seconds: retryAfter });
      }
      if (/FLOOD_WAIT_(\d+)/i.test(message)) {
        return t("login.errors.floodWait", {
          seconds: Number(/FLOOD_WAIT_(\d+)/i.exec(message)?.[1] ?? 0),
        });
      }
      if (/PHONE_NUMBER_INVALID|PHONE_NUMBER_BANNED/i.test(message)) {
        return t("login.errors.phone");
      }
      if (/PHONE_CODE_INVALID|PHONE_CODE_EXPIRED|PHONE_CODE_EMPTY/i.test(message)) {
        return t("login.errors.codeInvalid");
      }
      if (/PASSWORD_HASH_INVALID/i.test(message)) {
        return t("login.errors.passwordInvalid");
      }
      if (/database|bbolt|bolt|namespace/i.test(message)) {
        return t("login.errors.storage");
      }
      if (/tdata|Telegram Desktop/i.test(message)) {
        return t("login.errors.tdata");
      }
      if (/timed out|timeout|deadline|connection refused|no such host/i.test(message)) {
        return t("login.errors.timeout");
      }
      return message || t("login.errors.generic");
    },
    [t],
  );

  const localizeErrorRef = useRef(localizeError);
  const tRef = useRef(t);
  localizeErrorRef.current = localizeError;
  tRef.current = t;

  useEffect(() => {
    let alive = true;
    const off = Events.On("auth:event", (event) => {
      const payload = event.data as AuthEvent;
      if (!alive || !payload) {
        return;
      }

      switch (payload.state) {
        case "starting":
          setBusy(true);
          setError("");
          setNotice("");
          setTdataError("");
          break;
        case "qr":
          // Some transports can replay the same token event. Keeping the
          // existing deadline avoids the countdown visually freezing at 30s.
          if ((payload.qrUrl ?? "") !== qrUrlRef.current) {
            qrUrlRef.current = payload.qrUrl ?? "";
            setQrUrl(payload.qrUrl ?? "");
            setQrExpiresAt(Date.now() + (payload.qrExpiresIn ?? 30) * 1000);
          }
          setBusy(false);
          setError("");
          setRetryIn(0);
          setMode("qr");
          break;
        case "code": {
          const next: CodeInfo = {
            type: payload.codeType ?? "unknown",
            length: payload.codeLength ?? 0,
            timeout: payload.codeTimeout ?? 0,
            resent: Boolean(payload.resent),
          };
          setCodeInfo(next);
          setResendIn(next.timeout);
          setBusy(false);
          setError("");
          setRetryIn(0);
          setMode("code");
          autoCodeRef.current = "";
          if (next.resent) {
            setCode("");
            setNotice(tRef.current("login.codeResent"));
          } else {
            setNotice("");
          }
          break;
        }
        case "password":
          setPasswordHint(payload.passwordHint ?? "");
          setBusy(false);
          setError("");
          setRetryIn(0);
          setMode("password");
          break;
        case "success":
          if (payload.user) {
            setUser(payload.user);
          }
          setTdata(payload.tData ?? null);
          setTdataError(payload.tDataError ?? "");
          setBusy(false);
          setError("");
          setMode("success");
          break;
        case "error": {
          setBusy(false);
          setError(
            localizeErrorRef.current(
              payload.errorCode,
              payload.error ?? "",
              payload.retryAfter ?? 0,
            ),
          );
          if (payload.retryAfter) {
            setRetryIn(payload.retryAfter);
          }
          if (payload.errorCode === "PHONE_CODE_INVALID") {
            autoCodeRef.current = "";
            setCode("");
            setMode("code");
          }
          if (payload.errorCode === "PASSWORD_HASH_INVALID") {
            setPassword("");
            setMode("password");
          }
          break;
        }
        default:
          break;
      }
    });

    return () => {
      alive = false;
      off();
      void AppService.CancelLogin();
    };
  }, []);

  const resetError = () => {
    setError("");
    setNotice("");
  };

  const startQr = async () => {
    setMode("qr");
    setBusy(true);
    setError("");
    setNotice("");
    qrUrlRef.current = "";
    setQrUrl("");
    setQrExpiresAt(0);
    setRetryIn(0);
    try {
      await AppService.StartQR(proxyRef.current, ntpRef.current);
    } catch (startError) {
      setBusy(false);
      setError(localizeError(undefined, errorText(startError)));
    }
  };

  // The login screen is only mounted after AuthStatus reported "not signed in",
  // so QR login is the primary action and should be ready without an extra tap.
  useEffect(() => {
    void startQr();
    // Intentionally mount-only: language changes and re-renders must not restart
    // an in-flight QR token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goPhone = () => {
    void AppService.CancelLogin();
    setMode("phone");
    setBusy(false);
    setQrUrl("");
    setRetryIn(0);
    resetError();
  };

  const goQr = () => {
    void startQr();
  };

  const countryInfo = findCountry(country);
  const nationalPhone = phone.replace(/\D/g, "");
  const fullPhone = countryInfo ? `${countryInfo.dial} ${nationalPhone}` : "";

  const submitPhone = async () => {
    if (!countryInfo) {
      setError(t("login.errors.country"));
      return;
    }
    if (nationalPhone.length < 5) {
      setError(t("login.errors.phone"));
      return;
    }
    phoneRef.current = fullPhone;
    setError("");
    setNotice("");
    setBusy(true);
    setRetryIn(0);

    try {
      await AppService.StartPhone(fullPhone, proxyRef.current, ntpRef.current);
    } catch (startError) {
      setBusy(false);
      setError(localizeError(undefined, errorText(startError)));
    }
  };

  const submitCode = useCallback(async () => {
    const value = code.replace(/\D/g, "");
    if (value.length < 4) {
      setError(t("login.errors.code"));
      return;
    }
    if (retryIn > 0) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      await AppService.SubmitCode(value);
    } catch (submitError) {
      setBusy(false);
      setError(localizeError(undefined, errorText(submitError)));
    }
  }, [code, localizeError, retryIn, t]);

  // Telegram mobile clients submit as soon as the expected number of digits is
  // entered. The input is cleared on an invalid-code event, so this cannot loop.
  useEffect(() => {
    const value = code.replace(/\D/g, "");
    if (
      mode !== "code" ||
      busy ||
      retryIn > 0 ||
      !codeInfo.length ||
      value.length !== codeInfo.length ||
      autoCodeRef.current === value
    ) {
      return;
    }
    autoCodeRef.current = value;
    void submitCode();
  }, [busy, code, codeInfo.length, mode, retryIn, submitCode]);

  useEffect(() => {
    if (mode !== "code") {
      autoCodeRef.current = "";
    }
  }, [mode]);

  const resendCode = async () => {
    if (resendIn > 0 || busy) {
      return;
    }
    setError("");
    setResendIn(30);
    try {
      await AppService.ResendCode();
    } catch (resendError) {
      setResendIn(0);
      setError(localizeError(undefined, errorText(resendError)));
    }
  };

  const submitPassword = async () => {
    if (password.length < 1) {
      setError(t("login.errors.password"));
      return;
    }
    if (retryIn > 0) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      await AppService.SubmitPassword(password);
    } catch (submitError) {
      setBusy(false);
      setError(localizeError(undefined, errorText(submitError)));
    }
  };

  const backFromCode = () => {
    void AppService.CancelLogin();
    setCode("");
    setMode("phone");
    setBusy(false);
    resetError();
  };

  const restartPhone = () => {
    void AppService.CancelLogin();
    setPassword("");
    setCode("");
    setMode("phone");
    setBusy(false);
    resetError();
  };

  return (
    <LoginShell
      language={settings.language}
      onLanguageChange={(value) => onUpdate("language", value)}
    >
      {mode === "qr" ? (
        <LoginQrStep
          qrUrl={qrUrl}
          secondsLeft={qrSecondsLeft}
          busy={busy}
          error={error}
          notice={notice}
          importError={importError ? localizeError(undefined, importError) : ""}
          settings={settings}
          onUpdate={onUpdate}
          onPhone={goPhone}
          onRefresh={() => void startQr()}
          onApplyNetwork={() => void startQr()}
        />
      ) : null}

      {mode === "phone" ? (
        <LoginPhoneStep
          country={country}
          language={language}
          phone={phone}
          displayPhone={fullPhone}
          busy={busy}
          error={error}
          retryIn={retryIn}
          settings={settings}
          onUpdate={onUpdate}
          onCountry={(value) => {
            setCountry(value);
            resetError();
          }}
          onPhone={(value) => {
            setPhone(value);
            resetError();
          }}
          onSubmit={() => void submitPhone()}
          onBack={goQr}
          onApplyNetwork={() => undefined}
        />
      ) : null}

      {mode === "code" ? (
        <LoginCodeStep
          phone={phoneRef.current || fullPhone}
          code={code}
          codeInfo={codeInfo}
          resendIn={resendIn}
          retryIn={retryIn}
          busy={busy}
          error={error}
          notice={notice}
          onCode={(value) => {
            setCode(value.replace(/\D/g, ""));
            setError("");
          }}
          onSubmit={() => void submitCode()}
          onResend={() => void resendCode()}
          onBack={backFromCode}
        />
      ) : null}

      {mode === "password" ? (
        <LoginPasswordStep
          password={password}
          passwordHint={passwordHint}
          retryIn={retryIn}
          busy={busy}
          error={error}
          onPassword={(value) => {
            setPassword(value);
            setError("");
          }}
          onSubmit={() => void submitPassword()}
          onBack={restartPhone}
        />
      ) : null}

      {mode === "success" ? (
        <LoginSuccessStep user={user} tdata={tdata} tdataError={tdataError} />
      ) : null}
    </LoginShell>
  );
}
