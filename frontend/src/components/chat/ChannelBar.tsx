import { useTranslation } from "react-i18next";
import type { Chat, ChatProfile } from "../../types";
import { Icon } from "../../ui";
import { FooterPlate } from "./composer/FooterPlate";
import "./composer/composer-f.css";

interface ChannelBarProps {
  chat: Chat;
  onToast: (message: string) => void;
  /** Profile of the channel; its restriction reason is exposed for tests/CSS. */
  profile?: ChatProfile | null;
  /** Server-side mute toggle; falls back to the legacy toast until wired. */
  onToggleMute?: () => void;
  /** Optional override for `chat.muted` (e.g. server state after a live event). */
  muted?: boolean;
}

/**
 * Web K broadcast footer (§7): wide Mute/Unmute pill plus the gift side icon,
 * rendered in the same 24 px plate as the composer. This is the "can't post"
 * state of a channel; posting admins get the normal composer instead.
 */
export function ChannelBar({
  chat,
  onToast,
  profile,
  onToggleMute,
  muted,
}: ChannelBarProps) {
  const { t } = useTranslation();
  const isMuted = muted ?? Boolean(chat.muted);
  const label = isMuted ? t("input.unmute") : t("input.mute");

  return (
    <FooterPlate
      className="tg-composer--channel"
      label={label}
      trailing={
        <button
          type="button"
          className="tg-composer__icon"
          aria-label={t("chat.sendGift")}
          title={t("input.giftUnavailable")}
          data-restriction={profile?.sendRestriction || undefined}
          onClick={() => onToast(t("input.giftUnavailable"))}
        >
          <Icon name="redeem" size={22} />
        </button>
      }
      center={
        <button
          type="button"
          className="tg-composer__wide"
          aria-pressed={isMuted}
          title={label}
          onClick={() => {
            if (onToggleMute) {
              onToggleMute();
            } else {
              // Legacy local-only behaviour while the backend wiring lands.
              onToast(t("chat.channelNotificationsSoon"));
            }
          }}
        >
          {label}
        </button>
      }
    />
  );
}
