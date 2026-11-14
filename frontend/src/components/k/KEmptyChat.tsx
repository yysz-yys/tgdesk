import { useTranslation } from "react-i18next";
import { Window as WailsWindow } from "@wailsio/runtime";
import type { Chat } from "../../types";
import { KChatTips } from "./KChatTips";
import { KIcon } from "./KIcon";
import { toggleTips, useTipsState } from "./tipsStore";
import { useRipple } from "./useRipple";

/**
 * What the middle column shows while no chat is open, in the state the
 * reference capture is in: the chatTips deck collapsed (`hidden`), so only the
 * "Select a chat to start messaging" service pill is on the wallpaper
 * (tweb components/chatTips).
 */
interface KEmptyChatSurfaceProps {
  chats: Chat[];
  onSelectChat: (id: string) => void;
  onSettings?: () => void;
  /** Kernel RPC settings for loading the cloud theme list. */
  proxyUrl?: string;
  ntp?: string;
}

/** Empty-chat column wrapper; also the window's drag surface when no chat is open. */
export function KEmptyChatSurface({
  chats,
  onSelectChat,
  onSettings,
  proxyUrl,
  ntp,
}: KEmptyChatSurfaceProps) {
  const { hidden } = useTipsState();
  const { t } = useTranslation();

  return (
    <div
      className="k-empty-surface"
      style={{ "--wails-draggable": "drag" } as React.CSSProperties}
      onDoubleClick={() => void WailsWindow.ToggleMaximise()}
    >
      <div className="chat-tips-host">
        <KChatTips
          chats={chats}
          onOpenChat={onSelectChat}
          onSettings={onSettings}
          proxyUrl={proxyUrl}
          ntp={ntp}
        />
        <div
          className={
            hidden ? "chat-tips-select-chat is-shown" : "chat-tips-select-chat"
          }
          aria-hidden={!hidden}
        >
          <span
            className="chat-tips-select-chat-pill"
            style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
          >
            {t("chat.selectChat")}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The tips lightbulb: tweb portals it to `.page-chats` because `#column-center`
 * carries a translateX, which would otherwise become the containing block of
 * this fixed button and push it off-screen.
 */
export function KTipsToggle() {
  const { t } = useTranslation();
  const { hidden } = useTipsState();
  const ripple = useRipple<HTMLButtonElement>();

  return (
    <button
      ref={ripple.ref}
      type="button"
      className="btn-icon chat-tips-toggle"
      aria-label={t("chat.tips")}
      title={t("chat.tips")}
      aria-expanded={!hidden}
      onClick={() => toggleTips()}
      style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
    >
      <KIcon name={hidden ? "lamp_filled" : "close"} />
    </button>
  );
}
