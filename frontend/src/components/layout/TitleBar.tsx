import { Window as WailsWindow } from "@wailsio/runtime";
import { IconMinus, IconSquare, IconX } from "@tabler/icons-react";
import "./titlebar.css";

export function TitleBar() {
  return (
    <header
      className="tg-titlebar"
      style={{ "--wails-draggable": "drag" } as React.CSSProperties}
      onDoubleClick={() => void WailsWindow.ToggleMaximise()}
    >
      <div
        className="tg-titlebar-controls"
        style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          aria-label="Minimise"
          onClick={() => void WailsWindow.Minimise()}
        >
          <IconMinus size={13} stroke={1.6} />
        </button>
        <button
          type="button"
          aria-label="Maximise"
          onClick={() => void WailsWindow.ToggleMaximise()}
        >
          <IconSquare size={11} stroke={1.6} />
        </button>
        <button
          type="button"
          className="tg-titlebar-close"
          aria-label="Close"
          onClick={() => void WailsWindow.Close()}
        >
          <IconX size={13} stroke={1.6} />
        </button>
      </div>
    </header>
  );
}
