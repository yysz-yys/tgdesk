import React from "react";
import ReactDOM from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "./ui/f.css";
import "./i18n";
import App from "./App";
import { TitleBar } from "./components/layout/TitleBar";
import "./app.css";
import "./components/layout/layout.css";
import "./components/layout/shell-f.css";
import "./components/chat/chat.css";
import "./components/chat/dialogs-f.css";
import "./components/downloads/downloads-f.css";
import "./components/settings/settings-f.css";

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
