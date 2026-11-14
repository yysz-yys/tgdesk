import type { ReactNode } from "react";
import { KIconDefs } from "./KIcon";
import { KWallpaper } from "./KWallpaper";
import { KWindowChrome } from "./KWindowChrome";

/**
 * The logged-in Web K page shell: the page-wide wallpaper, #page-chats →
 * #main-columns with the left column and the middle column. Matches tweb's
 * index.html markup and pages/_chats.scss layout.
 */
export function KMainScreen({
  sidebar,
  center,
  overlay,
  chatOpen,
  animationLevel = 2,
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
}) {
  return (
    <div
      className="k-root"
      data-k-theme="light"
      data-animation-level={animationLevel}
    >
      <KIconDefs />
      <KWallpaper />
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
