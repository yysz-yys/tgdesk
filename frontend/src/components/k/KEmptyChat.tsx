import { useTranslation } from "react-i18next";
import { Window as WailsWindow } from "@wailsio/runtime";
import type { Chat } from "../../types";
import type { ThemePreference } from "../../hooks/useTheme";
import type { StickerSuggestMode } from "../../hooks/useSettings";
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
  /** Appearance setting, mirrored into the Appearance tip's System/Light/Dark pills. */
  themePreference: ThemePreference;
  onThemePreferenceChange: (
    preference: ThemePreference,
    point?: { x: number; y: number },
  ) => void;
  /** The brightness the app currently resolves to (system included). */
  resolvedNight: boolean;
  /** tweb appSettings `stickers.suggest`, mirrored into the Stickers tip pills. */
  stickerSuggest?: StickerSuggestMode;
  onStickerSuggestChange?: (mode: StickerSuggestMode) => void;
  /** The Stickers tip's "Trending Stickers" description link. */
  onOpenTrending?: () => void;
  /** The Chats tip's description link: close the sidebar pages and focus the
   * chat-list search (tweb's `closeAllTabsNaturally() + initSearch().open()`). */
  onOpenSearch?: () => void;
  /** The Chats tip's Popular list. The app leaves this undefined (the card
   * fetches it through lib/topPeers); the dev preview hands a fixture. */
  topPeers?: Chat[];
  /** True while the top-peers fetch is in flight (the card draws the empty
   * grid instead of its "Nothing here yet." line). */
  topPeersLoading?: boolean;
  /** tweb lite mode level: 0 disables sticker animations too. */
  animationLevel?: number;
}

/** Empty-chat column wrapper; also the window's drag surface when no chat is open. */
export function KEmptyChatSurface({
  chats,
  onSelectChat,
  onSettings,
  proxyUrl,
  ntp,
  themePreference,
  onThemePreferenceChange,
  resolvedNight,
  stickerSuggest,
  onStickerSuggestChange,
  onOpenTrending,
  onOpenSearch,
  topPeers,
  topPeersLoading,
  animationLevel = 2,
}: KEmptyChatSurfaceProps) {
  const { hidden } = useTipsState();
  const { t } = useTranslation();

  return (
    <div
      className="k-empty-surface"
      style={{ "--wails-draggable": "drag" } as React.CSSProperties}
      onDoubleClick={(event) => {
        // The tips card/nav are interactive: a double click there must not
        // maximise the window, and (with the CSS override below) a press there
        // must not start a window drag either.
        if (
          (event.target as HTMLElement).closest(
            ".k-tip-card, .k-chat-tips-nav, .chat-tips-select-chat, button, a",
          )
        ) {
          return;
        }
        void WailsWindow.ToggleMaximise();
      }}
    >
      <div className="chat-tips-host">
        <KChatTips
          chats={chats}
          onOpenChat={onSelectChat}
          onSettings={onSettings}
          proxyUrl={proxyUrl}
          ntp={ntp}
          themePreference={themePreference}
          onThemePreferenceChange={onThemePreferenceChange}
          resolvedNight={resolvedNight}
          stickerSuggest={stickerSuggest}
          onStickerSuggestChange={onStickerSuggestChange}
          onOpenTrending={onOpenTrending}
          onOpenSearch={onOpenSearch}
          topPeers={topPeers}
          topPeersLoading={topPeersLoading}
          animationsEnabled={animationLevel > 0}
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
      aria-label={t("tips.title")}
      title={t("tips.title")}
      aria-expanded={!hidden}
      onClick={() => toggleTips()}
      style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
    >
      <KIcon name={hidden ? "lamp_filled" : "close"} />
    </button>
  );
}
