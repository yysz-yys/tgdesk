import { Icon } from "../../../ui";
import { FooterPlate } from "./FooterPlate";

/**
 * Web A parity for chats where posting is impossible: the composer is replaced
 * by a grey bar carrying the restriction reason (report §2, restricted row).
 */
export function MessagingDisabledBar({
  text,
  hint,
}: {
  text: string;
  hint?: string;
}) {
  return (
    <FooterPlate
      className="tg-composer--disabled"
      label={hint ?? text}
      center={
        <div className="tg-composer__disabled" title={hint} role="note">
          <Icon name="lock" size={18} />
          <span className="tg-composer__disabled-text">{text}</span>
        </div>
      }
    />
  );
}
