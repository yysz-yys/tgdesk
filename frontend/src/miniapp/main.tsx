import React from "react";
import ReactDOM from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "../ui/f.css";
import "../app.css";
import "../i18n";
import { AppTheme, type Appearance } from "../ui/theme";
import { MiniAppWindow } from "./MiniAppWindow";
import "./mini-app.css";

/**
 * Entry point of the detached mini-app window. The window itself is created by
 * the Go app layer (`OpenBotWebView` → `/miniapp.html?session=…`); this page
 * only renders the Telegram-like chrome and the sandboxed web app iframe.
 */
function resolveAppearance(): Appearance {
  try {
    const raw = localStorage.getItem("tgdesk.settings");
    const preference = raw ? (JSON.parse(raw) as { theme?: string }).theme : "system";
    if (preference === "dark" || preference === "light") {
      return preference;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function MiniAppRoot() {
  const session = new URLSearchParams(window.location.search).get("session") ?? "";
  const appearance = resolveAppearance();
  return (
    <div className="mini-app-root">
      <AppTheme appearance={appearance}>
        <MiniAppWindow session={session} appearance={appearance} />
      </AppTheme>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MiniAppRoot />
  </React.StrictMode>,
);
