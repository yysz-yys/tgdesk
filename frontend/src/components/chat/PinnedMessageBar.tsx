import { useTranslation } from "react-i18next";
import type { Message } from "../../types";
import { Icon } from "../../ui";

interface PinnedMessageBarProps {
  message: Message;
  /** Title of the message author (or the chat itself for saved messages). */
  sender?: string;
  onJump: () => void;
  onUnpin: () => void;
  onDismiss: () => void;
}

/**
 * Telegram Web's pinned-message strip under the chat header: pin glyph, one
 * line preview (author + text or media name) and an unpin/close affordance.
 */
export function PinnedMessageBar({
  message,
  sender,
  onJump,
  onUnpin,
  onDismiss,
}: PinnedMessageBarProps) {
  const { t } = useTranslation();
  const preview =
    message.text?.trim() ||
    message.media?.name ||
    message.service ||
    t("chat.pinnedFallback");
  const author = message.out ? t("chat.you") : (sender || message.sender || "");
  const label = author ? `${author}: ${preview}` : preview;

  return (
    <div className="f-pinned-bar" role="button" tabIndex={0} onClick={onJump} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onJump();
      }
    }}>
      <span className="f-pinned-icon" aria-hidden="true">
        <Icon name="keep" size={18} />
      </span>
      <span className="f-pinned-copy">
        <span className="f-pinned-title">{t("chat.pinnedMessage")}</span>
        <span className="f-pinned-preview">{label}</span>
      </span>
      <span className="f-pinned-actions">
        <button
          type="button"
          className="f-pinned-action"
          aria-label={t("chat.unpinMessage")}
          title={t("chat.unpinMessage")}
          onClick={(event) => {
            event.stopPropagation();
            onUnpin();
          }}
        >
          <Icon name="keep_off" size={17} />
        </button>
        <button
          type="button"
          className="f-pinned-action"
          aria-label={t("chat.hidePinned")}
          title={t("chat.hidePinned")}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          <Icon name="close" size={17} />
        </button>
      </span>
    </div>
  );
}
