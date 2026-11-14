import type { CSSProperties } from "react";
import { Window as WailsWindow } from "@wailsio/runtime";

/**
 * Telegram Desktop style caption bar for the detached media viewer window:
 * a dark strip with the three window controls on the right. The rest of the
 * strip is the window drag area.
 */
export function ViewerTitleBar() {
  return (
    <header
      className="viewer-titlebar"
      style={{ "--wails-draggable": "drag" } as CSSProperties}
      onDoubleClick={() => void WailsWindow.ToggleMaximise()}
    >
      <div
        className="viewer-titlebar-controls"
        style={{ "--wails-draggable": "no-drag" } as CSSProperties}
      >
        <button
          type="button"
          className="viewer-titlebar-btn"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => void WailsWindow.Minimise()}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          type="button"
          className="viewer-titlebar-btn"
          aria-label="Maximize"
          title="Maximize"
          onClick={() => void WailsWindow.ToggleMaximise()}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </button>
        <button
          type="button"
          className="viewer-titlebar-btn viewer-titlebar-close"
          aria-label="Close"
          title="Close"
          onClick={() => void WailsWindow.Close()}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M0.5 0.5l9 9M9.5 0.5l-9 9"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
