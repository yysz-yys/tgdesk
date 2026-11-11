import { useTranslation } from "react-i18next";
import { IconBell, IconBellOff, IconGift } from "@tabler/icons-react";
import type { Chat } from "../../types";

interface ChannelBarProps {
  chat: Chat;
  onToast: (message: string) => void;
}

export function ChannelBar({ chat, onToast }: ChannelBarProps) {
  const { t } = useTranslation();
  const muted = Boolean(chat.muted);

  return (
    <div className="tg-channel-bar">
      <button
        type="button"
        className="tg-channel-action"
        onClick={() => onToast(t("chat.channelNotificationsSoon"))}
      >
        {muted ? <IconBellOff size={19} /> : <IconBell size={19} />}
        <span>{muted ? t("chat.enableNotifications") : t("chat.disableNotifications")}</span>
      </button>
      <button
        type="button"
        className="tg-channel-gift"
        onClick={() => onToast(t("chat.giftSoon"))}
        aria-label={t("chat.sendGift")}
      >
        <IconGift size={20} />
      </button>
    </div>
  );
}
