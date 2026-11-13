import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "../ui/f.css";
import "../app.css";
import "../components/layout/layout.css";
import "../components/auth/login.css";
import "../i18n";
import i18n from "../i18n";
import { defaultSettings, type AppSettings } from "../hooks/useSettings";
import { AppTheme } from "../ui/theme";
import { TitleBar } from "../components/layout/TitleBar";
import { LoginShell } from "../components/auth/LoginShell";
import { LoginQrStep } from "../components/auth/LoginQrStep";
import { LoginPhoneStep } from "../components/auth/LoginPhoneStep";
import { LoginCodeStep } from "../components/auth/LoginCodeStep";
import { LoginPasswordStep } from "../components/auth/LoginPasswordStep";
import { LoginSuccessStep } from "../components/auth/LoginSuccessStep";
import { LoginLoading } from "../components/auth/LoginLoading";
import { LoginNetworkSettings } from "../components/auth/LoginNetworkSettings";
import type { ThemePreference } from "../hooks/useTheme";

const params = new URLSearchParams(window.location.search);
const state = params.get("state") ?? "qr";
const theme: "light" | "dark" = params.get("theme") === "dark" ? "dark" : "light";

document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;
void i18n.changeLanguage("zh");

const settings: AppSettings = {
  ...defaultSettings,
  language: "zh",
  theme: theme as ThemePreference,
  proxyHost: "127.0.0.1",
  proxyPort: "1080",
};

const update = <K extends keyof AppSettings>(_key: K, _value: AppSettings[K]) => undefined;
const noop = () => undefined;
const qrUrl = "tg://login?token=AQG3bG9naW4tdG9rZW4tZm9yLXRnZGVzay1wcmV2aWV3";

function AutoOpenCountry() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trigger = document.querySelector<HTMLButtonElement>("[data-country-trigger]");
      trigger?.click();
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}

function AutoClick({ selector }: { selector: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(selector)?.click();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [selector]);
  return null;
}

function QrPreview() {
  return (
    <LoginQrStep
      qrUrl={qrUrl}
      secondsLeft={24}
      busy={false}
      error=""
      settings={settings}
      onUpdate={update}
      onPhone={noop}
      onRefresh={noop}
      onApplyNetwork={noop}
    />
  );
}

function content() {
  switch (state) {
    case "phone":
      return (
        <LoginPhoneStep
          country="CN"
          language="zh"
          phone="138 0013 8000"
          displayPhone="+86 138 0013 8000"
          busy={false}
          error=""
          retryIn={0}
          settings={settings}
          onUpdate={update}
          onCountry={noop}
          onPhone={noop}
          onSubmit={noop}
          onBack={noop}
          onApplyNetwork={noop}
        />
      );
    case "code":
      return (
        <LoginCodeStep
          phone="+86 138 0013 8000"
          code="4829"
          codeInfo={{ type: "app", length: 6, timeout: 30, resent: false }}
          resendIn={24}
          retryIn={0}
          busy={false}
          error=""
          notice=""
          onCode={noop}
          onSubmit={noop}
          onResend={noop}
          onBack={noop}
        />
      );
    case "password":
      return (
        <LoginPasswordStep
          password="tl-2026-spring"
          passwordHint="常用词 + 年份"
          retryIn={0}
          busy={false}
          error=""
          onPassword={noop}
          onSubmit={noop}
          onBack={noop}
        />
      );
    case "success":
      return <LoginSuccessStep tdataError="" />;
    case "network":
      return (
        <>
          <QrPreview />
          <LoginNetworkSettings
            open
            onOpenChange={noop}
            settings={{ ...settings, proxyType: "socks5" }}
            onUpdate={update}
            onApply={noop}
          />
        </>
      );
    case "country":
      return (
        <>
          <LoginPhoneStep
            country="CN"
            language="zh"
            phone="138 0013 8000"
            displayPhone="+86 138 0013 8000"
            busy={false}
            error=""
            retryIn={0}
            settings={settings}
            onUpdate={update}
            onCountry={noop}
            onPhone={noop}
            onSubmit={noop}
            onBack={noop}
            onApplyNetwork={noop}
          />
          <AutoOpenCountry />
        </>
      );
    case "error":
      return (
        <LoginQrStep
          qrUrl={qrUrl}
          secondsLeft={24}
          busy={false}
          error="无法连接 Telegram，请检查代理设置后重试。"
          settings={settings}
          onUpdate={update}
          onPhone={noop}
          onRefresh={noop}
          onApplyNetwork={noop}
        />
      );
    case "menu":
      return (
        <>
          <QrPreview />
          <AutoClick selector=".f-footer-language" />
        </>
      );
    case "expired":
      return (
        <LoginQrStep
          qrUrl={qrUrl}
          secondsLeft={0}
          busy={false}
          error=""
          settings={settings}
          onUpdate={update}
          onPhone={noop}
          onRefresh={noop}
          onApplyNetwork={noop}
        />
      );
    default:
      return <QrPreview />;
  }
}

function Preview() {
  const body =
    state === "loading" ? (
      <AppTheme appearance={theme}>
        <LoginLoading />
      </AppTheme>
    ) : (
      <AppTheme appearance={theme}>
        <LoginShell
          language="zh"
          onLanguageChange={noop}
          theme={settings.theme}
          onThemeChange={noop}
        >
          {content()}
        </LoginShell>
      </AppTheme>
    );

  return (
    <div className="g-window">
      <TitleBar />
      <div className="g-window-body">{body}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Preview />);
