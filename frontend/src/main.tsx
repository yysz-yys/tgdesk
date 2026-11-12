import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/material-symbols-rounded/latin-400.css";
import "./i18n";
import App from "./App";
import { TitleBar } from "./components/layout/TitleBar";
import "./app.css";
import "./components/ui/ui.css";
import "./components/layout/layout.css";
import "./components/chat/chat.css";
import "./components/downloads/downloads.css";
import "./components/settings/settings.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="g-window">
      <TitleBar />
      <div className="g-window-body">
        <App />
      </div>
    </div>
  </React.StrictMode>,
);
