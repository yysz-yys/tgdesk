import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Window as WailsWindow } from "@wailsio/runtime";
import { Icon } from "../ui/Icon";

/**
 * Frameless-window caption bar. It deliberately carries no product wordmark:
 * the navigation rail below already owns the brand, and a second label in the
 * title bar made the chrome feel stacked.
 */
export function TitleBar() {
  const { t } = useTranslation();

  return (
    <header
      className="g-titlebar"
      style={{ "--wails-draggable": "drag" } as CSSProperties}
      onDoubleClick={() => void WailsWindow.ToggleMaximise()}
    >
      <div
        className="g-titlebar-controls"
        style={{ "--wails-draggable": "no-drag" } as CSSProperties}
      >
        <button
          type="button"
          aria-label={t("common.minimize")}
          title={t("common.minimize")}
          onClick={() => void WailsWindow.Minimise()}
        >
          <Icon name="remove" size={13} />
        </button>
        <button
          type="button"
          aria-label={t("common.maximize")}
          title={t("common.maximize")}
          onClick={() => void WailsWindow.ToggleMaximise()}
        >
          <Icon name="crop_square" size={12} />
        </button>
        <button
          type="button"
          className="g-titlebar-close"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={() => void WailsWindow.Close()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  );
}
