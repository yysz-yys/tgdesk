import React from "react";
import ReactDOM from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "../ui/f.css";
import "../app.css";
import "../components/layout/layout.css";
import "../i18n";
import { AppTheme, type Appearance } from "../ui/theme";
import { ViewerWindow } from "./ViewerWindow";
import { ViewerTitleBar } from "./ViewerTitleBar";
import "./viewer.css";

/**
 * Entry point of the detached media viewer window: Telegram Desktop's viewer
 * layout (dark caption bar with window controls, media below).
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

function ViewerRoot() {
  const session = new URLSearchParams(window.location.search).get("session") ?? "";
  return (
    <div className="g-window viewer-window">
      <ViewerTitleBar />
      <div className="g-window-body viewer-window-body">
        <AppTheme appearance={resolveAppearance()}>
          <ViewerWindow session={session} />
        </AppTheme>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ViewerRoot />
  </React.StrictMode>,
);
