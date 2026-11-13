import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Button, IconButton } from "../../ui";

interface ChannelBarProps {
  chat: Chat;
  onToast: (message: string) => void;
}

export function ChannelBar({ chat, onToast }: ChannelBarProps) {
  const { t } = useTranslation();
  const muted = Boolean(chat.muted);

  return (
    <div className="g-channel-bar">
      <Button
        variant="ghost"
        size="1"
        icon={muted ? "notifications" : "notifications_off"}
        onClick={() => onToast(t("chat.channelNotificationsSoon"))}
      >
        {muted ? t("chat.enableNotifications") : t("chat.disableNotifications")}
      </Button>
      <IconButton
        label={t("chat.sendGift")}
        icon="redeem"
        size="1"
        onClick={() => onToast(t("chat.giftSoon"))}
      />
    </div>
  );
}
