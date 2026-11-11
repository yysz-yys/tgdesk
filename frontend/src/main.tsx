import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import App from "./App";
import { TitleBar } from "./components/layout/TitleBar";
import "./app.css";
import "./components/ui/atoms.css";
import "./login-settings.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="tg-shell">
      <TitleBar />
      <App />
    </div>
  </React.StrictMode>,
);
