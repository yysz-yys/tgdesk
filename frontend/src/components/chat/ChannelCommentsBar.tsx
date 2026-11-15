import { useTranslation } from "react-i18next";
import type { Message } from "../../types";
import { KIcon } from "../k/KIcon";
import { useRipple } from "../k/useRipple";
import "./comments-k.css";

export interface ChannelCommentsBarProps {
  message: Message;
  /**
   * Opens the post's linked discussion chat (and its thread for this post).
   * The Lead wires this in ChatView/App; without it the bar still renders.
   */
  onOpen?: (message: Message) => void;
}

/**
 * Web K's channel-post comments bar: the footer of the post's plate
 * (`replies-element.replies.replies-footer` in tweb). It is a separate rounded
 * strip under the post — same plate, so it inherits the bubble's bottom
 * corners — with the comments glyph, the label and the trailing chevron.
 *
 * Label (tweb `replies.ts`): the comment count when there is one, else
 * `LeaveAComment` ("Leave a comment" / "留言" / "コメントを残す").
 */
export function ChannelCommentsBar({ message, onOpen }: ChannelCommentsBarProps) {
  const { t } = useTranslation();
  const count = Math.max(0, message.commentsCount ?? 0);
  const label =
    count > 0
      ? t("chat.comments", { count })
      : t("chat.leaveAComment");
  const ripple = useRipple<HTMLButtonElement>();

  return (
    <button
      ref={ripple.ref}
      type="button"
      className="k-comments-bar"
      data-comments-count={count}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.(message);
      }}
    >
      <KIcon name="comments" className="k-comments-bar-icon" />
      <span className="k-comments-bar-text">{label}</span>
      <KIcon name="next" className="k-comments-bar-next" />
    </button>
  );
}
