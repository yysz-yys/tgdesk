import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Window as WailsWindow } from "@wailsio/runtime";

/** Inline caption glyphs drawn like Windows 11's (dash / square / X). */
function MinusGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function MaximizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="3.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M3.5 3.5v-3h6v6h-3" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

const dragStyle = { "--wails-draggable": "drag" } as CSSProperties;

/**
 * Window chrome for the frameless shell.
 *
 * Telegram Web (the thing this UI reproduces) has no window borders — its
 * controls belong to the browser. In the desktop app they would otherwise be
 * gone, so this mounts an invisible caption strip along the very top edge
 * (16 px of wallpaper) that:
 *   - drags the window (JS `--wails-draggable`, native caption drag + Aero snap),
 *   - toggles maximise on double click,
 *   - reveals web K-styled minimise / maximise / close buttons while the pointer
 *     is near the top edge; they fade away again, so the idle page stays 1:1.
 *
 * The Windows frameless window also resizes from its outer edge: Wails answers
 * WM_NCHITTEST with HTTOP/… for the outer `SM_CYSIZEFRAME + SM_CXPADDEDBORDER`
 * band, which is 8 CSS px on any DPI (the system metrics scale with the DPI and
 * cancel out in CSS px). Above the drag strip that band is a *resize* zone, but
 * the page's cursor would still be whatever CSS the DOM under the pointer
 * carries, so resize and drag looked identical along the whole top edge and a
 * drag attempt could turn into a resize. The resize frame below paints the
 * matching resize cursor exactly on that band (and on the other three edges and
 * corners), leaving the inner 8 px of the strip as the plain caption cursor for
 * dragging. It is hidden while the window is maximised, when Windows disables
 * the resize border.
 */
export function KWindowChrome() {
  const [visible, setVisible] = useState(false);
  const [maximised, setMaximised] = useState(false);
  const hideTimer = useRef<number>(0);

  useEffect(() => {
    const syncMaximised = () => {
      void WailsWindow.IsMaximised()
        .then((value) => setMaximised(Boolean(value)))
        .catch(() => undefined);
    };
    syncMaximised();

    const show = () => {
      window.clearTimeout(hideTimer.current);
      setVisible(true);
    };
    const scheduleHide = () => {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), 260);
    };
    const onMouseMove = (event: MouseEvent) => {
      if (event.clientY <= 14) {
        show();
        return;
      }
      if (event.clientY > 52) {
        scheduleHide();
      }
    };
    const onMouseLeave = () => scheduleHide();

    window.addEventListener("mousemove", onMouseMove, { capture: true, passive: true });
    window.addEventListener("blur", scheduleHide);
    window.addEventListener("mouseleave", onMouseLeave);
    // Maximising/restoring changes the client size; re-read the state then.
    window.addEventListener("resize", syncMaximised);
    return () => {
      window.clearTimeout(hideTimer.current);
      window.removeEventListener("mousemove", onMouseMove, { capture: true });
      window.removeEventListener("blur", scheduleHide);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", syncMaximised);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("k-chrome-visible", visible);
    return () => document.documentElement.classList.remove("k-chrome-visible");
  }, [visible]);

  const reveal = () => {
    window.clearTimeout(hideTimer.current);
    setVisible(true);
  };

  return (
    <>
      {/* Invisible top strip: window drag surface + caption hover target. The
          page's 16 px wallpaper inset means nothing interactive lives here; the
          outer 8 px are the native resize band, which the resize frame below
          covers with its cursor. */}
      <div
        className="k-window-drag-strip"
        style={dragStyle}
        onDoubleClick={() => void WailsWindow.ToggleMaximise()}
        onMouseEnter={reveal}
        aria-hidden="true"
      />

      {/* Resize cursor overlays for the native frameless resize border. Wails
          resizes the window from the outer 8 CSS px, but the WebView keeps
          painting its own cursor there, so these edge strips (and corners) give
          the resize zones the system cursors; the inner part of the top strip
          stays the caption cursor for dragging. */}
      {!maximised && (
        <div className="k-window-resize-frame" aria-hidden="true">
          <div className="k-window-resize k-window-resize-top" />
          <div className="k-window-resize k-window-resize-bottom" />
          <div className="k-window-resize k-window-resize-left" />
          <div className="k-window-resize k-window-resize-right" />
          <div className="k-window-resize k-window-resize-top-left" />
          <div className="k-window-resize k-window-resize-top-right" />
          <div className="k-window-resize k-window-resize-bottom-left" />
          <div className="k-window-resize k-window-resize-bottom-right" />
        </div>
      )}

      <div
        className={
          visible ? "k-window-controls is-visible" : "k-window-controls"
        }
        onMouseEnter={reveal}
        onMouseLeave={() => {
          window.clearTimeout(hideTimer.current);
          hideTimer.current = window.setTimeout(() => setVisible(false), 260);
        }}
      >
        <button
          type="button"
          className="k-window-control"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => void WailsWindow.Minimise()}
        >
          <MinusGlyph />
        </button>
        <button
          type="button"
          className="k-window-control"
          aria-label={maximised ? "Restore" : "Maximize"}
          title={maximised ? "Restore" : "Maximize"}
          onClick={() => {
            void WailsWindow.ToggleMaximise();
            window.setTimeout(() => {
              void WailsWindow.IsMaximised()
                .then((value) => setMaximised(Boolean(value)))
                .catch(() => undefined);
            }, 120);
          }}
        >
          {maximised ? <RestoreGlyph /> : <MaximizeGlyph />}
        </button>
        <button
          type="button"
          className="k-window-control k-window-control-close"
          aria-label="Close"
          title="Close"
          onClick={() => void WailsWindow.Close()}
        >
          <CloseGlyph />
        </button>
      </div>
    </>
  );
}
