import { useTranslation } from "react-i18next";
import type { Chat, ChatProfile } from "../../types";
import { Icon } from "../../ui";
import { ControlPlate } from "./composer/ControlPlate";
import { ComposerButton } from "./composer/ComposerButton";

interface ChannelBarProps {
  chat: Chat;
  onToast: (message: string) => void;
  profile?: ChatProfile | null;
  /** Server-side mute toggle; falls back to the legacy toast until wired. */
  onToggleMute?: () => void;
  /** Optional override for `chat.muted` (e.g. server state after a live event). */
  muted?: boolean;
  /** Broadcast channels keep the gift side button; gigagroups do not (input.ts:3373). */
  showGift?: boolean;
  /** Gift side button (broadcast channels only); not wired, toasts for now. */
  onSendGift?: () => void;
  /** Comments side button (only with a linked monoforum chat). */
  onOpenComments?: () => void;
}

/**
 * Web K broadcast "can't write" control plate (input.ts:3336-3376): a wide
 * transparent Mute/Unmute centre button, the gift icon on the right for
 * broadcast channels and the direct-messages (comments) icon on the left when a
 * monoforum chat is linked. The chat profile carries no monoforum id in this TL
 * layer, so the left slot is normally absent.
 */
export function ChannelBar({
  chat,
  onToast,
  profile,
  onToggleMute,
  muted,
  showGift = true,
  onSendGift,
  onOpenComments,
}: ChannelBarProps) {
  const { t } = useTranslation();
  const isMuted = muted ?? Boolean(chat.muted);
  const label = isMuted ? t("input.unmute") : t("input.mute");
  const linkedMonoforumId = (
    profile as (ChatProfile & { linkedMonoforumId?: string }) | null | undefined
  )?.linkedMonoforumId;

  return (
    <ControlPlate
      leading={
        linkedMonoforumId ? (
          <ComposerButton
            className="tg-composer__icon"
            aria-label={t("input.comment")}
            title={t("input.comment")}
            onClick={() => {
              if (onOpenComments) {
                onOpenComments();
              } else {
                onToast(t("profileHome.comingSoon"));
              }
            }}
          >
            <Icon name="forum" size={24} />
          </ComposerButton>
        ) : undefined
      }
      center={
        <ComposerButton
          className="tg-composer__plate-button tg-composer__plate-button--transparent"
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
        </ComposerButton>
      }
      trailing={
        showGift ? (
          <ComposerButton
            className="tg-composer__icon"
            aria-label={t("chat.sendGift")}
            title={t("input.giftUnavailable")}
            data-restriction={profile?.sendRestriction || undefined}
            onClick={() => {
              if (onSendGift) {
                onSendGift();
              } else {
                onToast(t("input.giftUnavailable"));
              }
            }}
          >
            <Icon name="redeem" size={24} />
          </ComposerButton>
        ) : undefined
      }
    />
  );
}
