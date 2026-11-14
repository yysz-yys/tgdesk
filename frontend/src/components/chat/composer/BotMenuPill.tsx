/**
 * Telegram's "webview" glyph: a browser window with an accent title bar. Kept
 * inline so the shared Icon map does not need a new entry for one composer
 * affordance.
 */
function WebviewGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3"
        y="4.5"
        width="18"
        height="15"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M3.4 9h17.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M11 12.5h5.5M14 10l2.6 2.5-2.6 2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Bot menu pill from Web K (§5): primary filled pill with the webview icon and
 * the bot-provided button text, shown left of the attach button. Clicking it
 * opens the bot Web App through the app-level mini-app window.
 */
export function BotMenuPill({
  text,
  onClick,
}: {
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tg-composer__bot-pill"
      title={text}
      aria-label={text}
      onClick={onClick}
    >
      <WebviewGlyph size={20} />
      <span className="tg-composer__bot-pill-text">{text}</span>
    </button>
  );
}
