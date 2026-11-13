import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Window as WailsWindow } from "@wailsio/runtime";
import { Icon } from "../../ui";
import "./titlebar.css";

/**
 * Frameless-window caption bar in the F language: a quiet canvas strip with
 * the three system controls. The shell owns the brand, so the bar stays bare.
 */
export function TitleBar() {
  const { t } = useTranslation();

  return (
    <header
      className="f-titlebar"
      style={{ "--wails-draggable": "drag" } as CSSProperties}
      onDoubleClick={() => void WailsWindow.ToggleMaximise()}
    >
      <div
        className="f-titlebar-controls"
        style={{ "--wails-draggable": "no-drag" } as CSSProperties}
      >
        <button
          type="button"
          className="f-titlebar-btn"
          aria-label={t("common.minimize")}
          title={t("common.minimize")}
          onClick={() => void WailsWindow.Minimise()}
        >
          <Icon name="remove" size={13} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="f-titlebar-btn"
          aria-label={t("common.maximize")}
          title={t("common.maximize")}
          onClick={() => void WailsWindow.ToggleMaximise()}
        >
          <Icon name="crop_square" size={11} strokeWidth={1.4} />
        </button>
        <button
          type="button"
          className="f-titlebar-btn f-titlebar-close"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={() => void WailsWindow.Close()}
        >
          <Icon name="close" size={14} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
