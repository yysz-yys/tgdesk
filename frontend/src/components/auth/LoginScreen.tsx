import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Events } from "@wailsio/runtime";
import { Service as AppService } from "../../../bindings/tgdesk/internal/app";
import type { AppSettings } from "../../hooks/useSettings";
import type { AuthEvent, AuthUser } from "../../types";
import { LoginShell } from "./LoginShell";
import { LoginQrStep } from "./LoginQrStep";
import { LoginPhoneStep } from "./LoginPhoneStep";
import { LoginCodeStep } from "./LoginCodeStep";
import { LoginPasswordStep } from "./LoginPasswordStep";
import { LoginSuccessStep } from "./LoginSuccessStep";
import { LoginWelcomeStep } from "./LoginWelcomeStep";
import { Callout } from "../ui/Callout";
import "./login.css";

type Mode = "welcome" | "qr" | "phone" | "code" | "password" | "success";

interface LoginScreenProps {
  onAuthenticated: (user: AuthUser) => void;
  tdlVersion?: string;
  proxy?: string;
  ntp?: string;
  importError?: string;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const COUNTRIES = [
  { code: "+86", region: "CN" },
  { code: "+1", region: "US" },
  { code: "+44", region: "GB" },
  { code: "+49", region: "DE" },
  { code: "+7", region: "RU" },
];

function countryName(region: string, language: string) {
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(region) ?? region;
  } catch {
    return region;
  }
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
  tdlVersion,
  proxy = "",
  ntp = "",
  importError = "",
  settings,
  onUpdate,
}: LoginScreenProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const [mode, setMode] = useState<Mode>("welcome");
  const [country, setCountry] = useState("+86");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const phoneRef = useRef("");
  const proxyRef = useRef(proxy);
  const ntpRef = useRef(ntp);

  const localizeError = (message: string) => {
    if (/database|bbolt|bolt|namespace/i.test(message)) {
      return t("login.errors.storage");
    }
    if (/tdata|Telegram Desktop/i.test(message)) {
      return t("login.errors.tdata");
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
    if (/migration|data[- ]center/i.test(message)) {
      return t("login.errors.migration");
    }
    if (/timed out|timeout/i.test(message)) {
      return t("login.errors.timeout");
    }
    return message || t("login.errors.generic");
  };

  useEffect(() => {
    proxyRef.current = proxy;
    ntpRef.current = ntp;
  }, [proxy, ntp]);

  useEffect(() => {
    if (mode !== "success" || !user) {
      return;
    }
    const timer = window.setTimeout(() => onAuthenticated(user), 900);
    return () => window.clearTimeout(timer);
  }, [mode, user, onAuthenticated]);

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
          break;
        case "qr":
          setQrUrl(payload.qrUrl ?? "");
          setBusy(false);
          setError("");
          setMode("qr");
          break;
        case "code":
          setBusy(false);
          setError("");
          setMode("code");
          break;
        case "password":
          setBusy(false);
          setError("");
          setMode("password");
          break;
        case "success":
          if (payload.user) {
            setUser(payload.user);
          }
          setBusy(false);
          setError("");
          setMode("success");
          break;
        case "error":
          setBusy(false);
          setError(localizeError(payload.error ?? ""));
          break;
        default:
          break;
      }
    });

    return () => {
      alive = false;
      off();
      void AppService.CancelLogin();
    };
  }, [t]);

  const resetError = () => setError("");

  const startQr = async () => {
    setMode("qr");
    setBusy(true);
    setError("");
    setNotice("");
    setQrUrl("");
    try {
      await AppService.StartQR(proxy, ntp);
    } catch (startError) {
      setBusy(false);
      setError(localizeError(errorText(startError)));
    }
  };

  const goWelcome = () => {
    void AppService.CancelLogin();
    setMode("welcome");
    setBusy(false);
    setError("");
    setNotice("");
    setQrUrl("");
  };

  const goPhone = () => {
    void AppService.CancelLogin();
    setMode("phone");
    setBusy(false);
    setError("");
    setNotice("");
    setQrUrl("");
  };

  const goQr = () => {
    void startQr();
  };

  const toggleLanguage = () => {
    const next = language.startsWith("zh") ? "en" : "zh";
    onUpdate("language", next);
  };

  const languageLabel = language.startsWith("zh")
    ? t("login.continueEnglish")
    : t("login.continueChinese");

  const submitPhone = async () => {
    if (phone.replace(/\D/g, "").length < 6) {
      setError(t("login.errors.phone"));
      return;
    }

    const fullPhone = `${country} ${phone}`;
    phoneRef.current = fullPhone;
    setError("");
    setBusy(true);

    try {
      await AppService.StartPhone(fullPhone, proxy, ntp);
    } catch (startError) {
      setBusy(false);
      setError(localizeError(errorText(startError)));
    }
  };

  const submitCode = async () => {
    if (code.replace(/\D/g, "").length < 4) {
      setError(t("login.errors.code"));
      return;
    }

    setError("");
    setBusy(true);
    try {
      await AppService.SubmitCode(code);
    } catch (submitError) {
      setBusy(false);
      setError(localizeError(errorText(submitError)));
    }
  };

  const submitPassword = async () => {
    if (password.length < 1) {
      setError(t("login.errors.password"));
      return;
    }

    setError("");
    setBusy(true);
    try {
      await AppService.SubmitPassword(password);
    } catch (submitError) {
      setBusy(false);
      setError(localizeError(errorText(submitError)));
    }
  };

  const fullPhone = phoneRef.current || `${country} ${phone}`;
  const surface =
    mode === "welcome"
      ? "welcome"
      : mode === "qr"
        ? "qr"
        : mode === "success"
          ? "success"
          : "form";

  return (
    <LoginShell tdlVersion={tdlVersion} surface={surface}>
      {mode === "welcome" ? (
        <LoginWelcomeStep
          busy={busy}
          onStart={() => void startQr()}
          onLanguage={toggleLanguage}
          languageLabel={languageLabel}
          extra={
            importError ? (
              <Callout tone="error" className="tg-login-welcome-error">
                {localizeError(importError)}
              </Callout>
            ) : null
          }
        />
      ) : null}

      {mode === "qr" ? (
        <LoginQrStep
          qrUrl={qrUrl}
          error={error}
          notice={notice}
          importError={importError ? localizeError(importError) : ""}
          settings={settings}
          onUpdate={onUpdate}
          onPhone={goPhone}
          onPasskey={() => setNotice(t("login.passkeySoon"))}
          onBack={goWelcome}
          onApplyNetwork={() => void startQr()}
        />
      ) : null}

      {mode === "phone" ? (
        <LoginPhoneStep
          country={country}
          countries={COUNTRIES}
          countryName={countryName}
          language={language}
          phone={phone}
          busy={busy}
          error={error}
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
        />
      ) : null}

      {mode === "code" ? (
        <LoginCodeStep
          phone={fullPhone}
          code={code}
          busy={busy}
          error={error}
          onCode={(value) => {
            setCode(value);
            resetError();
          }}
          onSubmit={() => void submitCode()}
          onBack={goPhone}
        />
      ) : null}

      {mode === "password" ? (
        <LoginPasswordStep
          password={password}
          busy={busy}
          error={error}
          onPassword={(value) => {
            setPassword(value);
            resetError();
          }}
          onSubmit={() => void submitPassword()}
        />
      ) : null}

      {mode === "success" ? <LoginSuccessStep user={user} /> : null}
    </LoginShell>
  );
}
