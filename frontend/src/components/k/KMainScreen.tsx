import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { KIconDefs } from "./KIcon";
import { KWallpaper } from "./KWallpaper";
import { KWindowChrome } from "./KWindowChrome";
import { syncShellTheme, useActiveTheme } from "./themeStore";

/**
 * The logged-in Web K page shell: the page-wide wallpaper, #page-chats →
 * #main-columns with the left column and the middle column. Matches tweb's
 * index.html markup and pages/_chats.scss layout.
 *
 * The shell's brightness lives on this element (`data-k-theme`), which is what
 * the dark token block in styles/k/tokens.css keys off; the applied cloud theme
 * follows it — its day side paints the light shell, its night side the dark one.
 */
export function KMainScreen({
  sidebar,
  center,
  overlay,
  chatOpen,
  animationLevel = 2,
  theme = "light",
}: {
  sidebar: ReactNode;
  center: ReactNode;
  /** Page-level floating controls (fixed-position elements must not live inside
   * the transformed #column-center). */
  overlay?: ReactNode;
  /** A chat (or another full-width pane) fills the middle column: drop the
   * empty-state centring transform so the pane is not pushed off-screen. */
  chatOpen?: boolean;
  /** tweb liteMode animation level: 2 full, 1 reduced, 0 off. */
  animationLevel?: number;
  /** The resolved appearance: the Web K shell's light or dark variant. */
  theme?: "light" | "dark";
}) {
  const night = theme === "dark";
  const activeTheme = useActiveTheme();

  // Paint the applied theme's accent/highlighting for this brightness before the
  // browser commits the frame, so switching System/Light/Dark repaints in sync
  // with the dark tokens and the wallpaper swap.
  useLayoutEffect(() => {
    syncShellTheme(activeTheme, night);
  }, [activeTheme, night]);

  return (
    <div
      className="k-root"
      data-k-theme={theme}
      data-animation-level={animationLevel}
    >
      <KIconDefs />
      <KWallpaper night={night} />
      <KWindowChrome />
      <div className="whole page-chats" id="page-chats">
        <div id="main-columns" className="tabs-container" data-animation="navigation">
          {sidebar}
          <div
            className={
              chatOpen
                ? "tabs-tab main-column active is-chat-open"
                : "tabs-tab main-column active"
            }
            id="column-center"
            role="main"
          >
            {center}
          </div>
          {overlay}
        </div>
      </div>
    </div>
  );
}
