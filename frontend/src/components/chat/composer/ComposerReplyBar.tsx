import { useTranslation } from "react-i18next";
import type { Message } from "../../../types";
import { Icon } from "../../../ui";
import { ComposerButton } from "./ComposerButton";

function contextPreview(message: Message): string {
  if (message.text?.trim()) {
    return message.text;
  }
  return message.media?.name ?? "";
}

/**
 * Reply / edit header docked on top of the composer plate. Web K keeps it as a
 * row inside the same 24 px card (`_chat.scss:996-1071`): the header animates
 * 0→48px, the chip has an 8px radius and 40px minimum height, the title is the
 * peer's name (reply) or "Editing" (edit) — never a "Reply to ..." sentence —
 * and the cancel button's accessible name is the plain "Cancel" string
 * (input.ts:908,6191; AccDescrEditing).
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
  const title = editing
    ? t("input.editingTitle")
    : replyingTo?.out
      ? t("chat.you")
      : replyingTo?.sender || t("chat.sender");

  // The header stays mounted so its 0→48px height can animate like Web K's
  // `.chat.is-helper-active .reply-wrapper` (_chat.scss:1017-1025).
  return (
    <div
      className="tg-composer__reply"
      data-active={context ? true : undefined}
      data-editing={editing ? true : undefined}
      aria-hidden={context ? undefined : true}
    >
      {context ? (
        <div className="tg-composer__reply-chip">
          <span className="tg-composer__reply-icon">
            <Icon name={editing ? "edit" : "reply"} size={24} />
          </span>
          <span className="tg-composer__reply-copy">
            <span className="tg-composer__reply-title">{title}</span>
            <span className="tg-composer__reply-text">
              {contextPreview(context)}
            </span>
          </span>
          <ComposerButton
            className="tg-composer__icon tg-composer__reply-cancel"
            aria-label={t("input.cancel")}
            title={t("input.cancel")}
            onClick={onCancel}
          >
            <Icon name="close" size={24} />
          </ComposerButton>
        </div>
      ) : null}
    </div>
  );
}
