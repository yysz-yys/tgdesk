import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Events } from "@wailsio/runtime";
import {
  IconArrowLeft,
  IconCheck,
  IconLoader2,
  IconMoon,
  IconPhone,
  IconQrcode,
  IconRefresh,
  IconShieldLock,
  IconSun,
} from "@tabler/icons-react";
import { QRCodeSVG } from "qrcode.react";
import { Service as AppService } from "../../../bindings/tgdesk/internal/app";
import type { AppSettings } from "../../hooks/useSettings";
import type { AuthEvent, AuthUser, ResolvedTheme } from "../../types";

type Mode = "qr" | "phone" | "code" | "password" | "success";

interface LoginScreenProps {
  theme: ResolvedTheme;
  onToggleTheme: () => void;
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
  theme,
  onToggleTheme,
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
  const [mode, setMode] = useState<Mode>("qr");
  const [country, setCountry] = useState("+86");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
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

    void AppService.StartQR(proxyRef.current, ntpRef.current).catch((startError: unknown) => {
      if (alive) {
        setBusy(false);
        setError(localizeError(errorText(startError)));
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
    setQrUrl("");
    try {
      await AppService.StartQR(proxy, ntp);
    } catch (startError) {
      setBusy(false);
      setError(localizeError(errorText(startError)));
    }
  };

  const goPhone = () => {
    void AppService.CancelLogin();
    setMode("phone");
    setBusy(false);
    setError("");
    setQrUrl("");
  };

  const goQr = () => {
    void startQr();
  };

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
  const errorBlock = error ? (
    <>
      <p className="login-error">{error}</p>
      {mode === "code" || mode === "password" ? (
        <button type="button" className="login-link" onClick={goPhone}>
          {t("login.startOver")}
        </button>
      ) : null}
    </>
  ) : null;

  return (
    <div className="login-screen">
      <button
        type="button"
        className="icon-button login-theme-toggle"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? t("login.themeLight") : t("login.themeDark")}
      >
        {theme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
      </button>

      <main className="login-card">
        <div className="login-brand">
          <span className="login-logo">tg</span>
          <h1>{t("login.title")}</h1>
          <p>{t("login.subtitle")}</p>
        </div>

        {importError ? <p className="login-error">{localizeError(importError)}</p> : null}

        {(mode === "qr" || mode === "phone") && (
          <div className="login-tabs" role="tablist" aria-label={t("login.methodLabel")}>
            <button
              type="button"
              role="tab"
              className="login-tab"
              data-active={mode === "qr"}
              aria-selected={mode === "qr"}
              onClick={goQr}
            >
              <IconQrcode size={16} />
              {t("login.qrTab")}
            </button>
            <button
              type="button"
              role="tab"
              className="login-tab"
              data-active={mode === "phone"}
              aria-selected={mode === "phone"}
              onClick={goPhone}
            >
              <IconPhone size={16} />
              {t("login.phoneTab")}
            </button>
          </div>
        )}

        {mode === "qr" && (
          <div className="login-body">
            <div className="qr-card">
              {qrUrl ? (
                <QRCodeSVG
                  value={qrUrl}
                  size={204}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#111111"
                  marginSize={1}
                  title={t("login.qrTitle")}
                />
              ) : (
                <div className="qr-placeholder">
                  <IconLoader2 className="login-spin" size={26} />
                  <span>{t("login.generatingQr")}</span>
                </div>
              )}
            </div>
            <p className="login-hint">{t("login.scanHint")}</p>
            {errorBlock}
            <button type="button" className="login-link" onClick={() => void startQr()}>
              <IconRefresh size={14} />
              {t("login.refreshQr")}
            </button>
            <div className="login-divider">
              <span>{t("login.or")}</span>
            </div>
            <button type="button" className="login-secondary" onClick={goPhone}>
              <IconPhone size={16} />
              {t("login.phoneLogin")}
            </button>

            <details className="login-network">
              <summary>{t("login.networkSettings")}</summary>
              <p className="login-network-hint">{t("login.networkHint")}</p>
              <select
                className="login-select login-network-select"
                value={settings.proxyType}
                onChange={(event) =>
                  onUpdate("proxyType", event.target.value as AppSettings["proxyType"])
                }
                aria-label={t("settings.network.proxyType")}
              >
                <option value="none">{t("settings.network.none")}</option>
                <option value="socks5">{t("settings.network.socks5")}</option>
                <option value="http">{t("settings.network.http")}</option>
              </select>
              {settings.proxyType !== "none" && (
                <>
                  <div className="login-network-row">
                    <input
                      className="login-input"
                      value={settings.proxyHost}
                      onChange={(event) => onUpdate("proxyHost", event.target.value)}
                      placeholder={t("settings.network.host")}
                      spellCheck={false}
                    />
                    <input
                      className="login-input"
                      value={settings.proxyPort}
                      onChange={(event) => onUpdate("proxyPort", event.target.value)}
                      placeholder={t("settings.network.port")}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="login-network-row">
                    <input
                      className="login-input"
                      value={settings.proxyUser}
                      onChange={(event) => onUpdate("proxyUser", event.target.value)}
                      placeholder={t("settings.network.username")}
                      spellCheck={false}
                    />
                    <input
                      className="login-input"
                      type="password"
                      value={settings.proxyPass}
                      onChange={(event) => onUpdate("proxyPass", event.target.value)}
                      placeholder={t("settings.network.password")}
                    />
                  </div>
                </>
              )}
              <button
                type="button"
                className="login-secondary login-network-apply"
                onClick={() => void startQr()}
              >
                {t("login.applyNetwork")}
              </button>
            </details>
          </div>
        )}

        {mode === "phone" && (
          <form
            className="login-body"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPhone();
            }}
          >
            <div className="login-heading">
              <h2>{t("login.phoneTitle")}</h2>
              <p>{t("login.phoneDescription")}</p>
            </div>

            <div className="phone-row">
              <select
                className="login-select"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                aria-label={t("login.country")}
              >
                {COUNTRIES.map((item) => (
                  <option value={item.code} key={item.code}>
                    {item.code} {countryName(item.region, language)}
                  </option>
                ))}
              </select>
              <input
                className="login-input"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  resetError();
                }}
                placeholder={t("login.phonePlaceholder")}
                inputMode="tel"
                autoFocus
              />
            </div>

            {errorBlock}

            <button type="submit" className="login-primary" disabled={busy}>
              {busy ? <IconLoader2 className="login-spin" size={18} /> : null}
              {busy ? t("login.signingIn") : t("login.continue")}
            </button>
          </form>
        )}

        {mode === "code" && (
          <form
            className="login-body"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCode();
            }}
          >
            <button type="button" className="login-back" onClick={goPhone}>
              <IconArrowLeft size={16} />
              {t("login.back")}
            </button>
            <div className="login-heading">
              <h2>{t("login.codeTitle")}</h2>
              <p>{t("login.codeSent", { phone: fullPhone })}</p>
            </div>
            <input
              className="login-input login-code-input"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                resetError();
              }}
              placeholder={t("login.codePlaceholder")}
              inputMode="numeric"
              autoFocus
            />
            {errorBlock}
            <button type="submit" className="login-primary" disabled={busy}>
              {busy ? <IconLoader2 className="login-spin" size={18} /> : null}
              {busy ? t("login.signingIn") : t("login.continue")}
            </button>
          </form>
        )}

        {mode === "password" && (
          <form
            className="login-body"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPassword();
            }}
          >
            <div className="login-heading">
              <span className="login-lock">
                <IconShieldLock size={20} />
              </span>
              <h2>{t("login.passwordTitle")}</h2>
              <p>{t("login.passwordDescription")}</p>
            </div>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                resetError();
              }}
              placeholder={t("login.passwordPlaceholder")}
              autoFocus
            />
            {errorBlock}
            <button type="submit" className="login-primary" disabled={busy}>
              {busy ? <IconLoader2 className="login-spin" size={18} /> : null}
              {busy ? t("login.signingIn") : t("login.continue")}
            </button>
          </form>
        )}

        {mode === "success" && (
          <div className="login-body login-success">
            <span className="login-success-icon">
              <IconCheck size={30} stroke={2.4} />
            </span>
            <h2>{t("login.successTitle")}</h2>
            <p>{user?.displayName ?? t("login.successDescription")}</p>
            <IconLoader2 className="login-spin" size={18} />
          </div>
        )}

        <footer className="login-footer">
          <span>
            {tdlVersion
              ? t("sidebar.tdlVersion", { version: tdlVersion })
              : t("sidebar.kernel")}
          </span>
          <span className="login-footer-dot" />
          <span>AGPL-3.0</span>
          <span className="login-footer-dot" />
          <span>{t("login.footerReal")}</span>
        </footer>
      </main>
    </div>
  );
}
