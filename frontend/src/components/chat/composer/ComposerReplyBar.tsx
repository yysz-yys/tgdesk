import { useTranslation } from "react-i18next";
import type { Message } from "../../../types";
import { Icon } from "../../../ui";

function contextPreview(message: Message): string {
  if (message.text?.trim()) {
    return message.text;
  }
  return message.media?.name ?? "";
}

/**
 * Reply / edit header docked on top of the composer plate. Web K renders it as
 * a secondary rounded chip inside the same 24 px card (`.reply-wrapper` with a
 * 8 px-radius `.reply` bubble), not as a separate bar above the composer.
 */
export function ComposerReplyBar({
  replyingTo,
  editing,
  onCancel,
}: {
  replyingTo?: Message | null;
  editing?: Message | null;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const context = editing ?? replyingTo;
  if (!context) {
    return null;
  }
  const title = editing
    ? t("chat.editingMessage")
    : t("chat.replyTo", {
        name: replyingTo?.out
          ? t("chat.you")
          : replyingTo?.sender || t("chat.sender"),
      });

  return (
    <div className="tg-composer__reply" data-editing={editing ? true : undefined}>
      <div className="tg-composer__reply-chip">
        <span className="tg-composer__reply-icon">
          <Icon name={editing ? "edit" : "reply"} size={20} />
        </span>
        <span className="tg-composer__reply-accent" aria-hidden="true" />
        <span className="tg-composer__reply-copy">
          <span className="tg-composer__reply-title">{title}</span>
          <span className="tg-composer__reply-text">
            {contextPreview(context)}
          </span>
        </span>
        <button
          type="button"
          className="tg-composer__icon tg-composer__icon--compact"
          aria-label={t("chat.cancelReply")}
          title={t("chat.cancelReply")}
          onClick={onCancel}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
    </div>
  );
}
