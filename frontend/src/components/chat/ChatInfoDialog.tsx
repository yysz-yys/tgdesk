import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { ChatAvatar, type ChatAvatarLoader } from "./ChatAvatar";

interface ChatInfoDialogProps {
  chat: Chat;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadAvatar: ChatAvatarLoader;
}

export function ChatInfoDialog({
  chat,
  open,
  onOpenChange,
  onLoadAvatar,
}: ChatInfoDialogProps) {
  const { t } = useTranslation();
  const kind = t(
    chat.kind === "private"
      ? "rightPanel.privateChat"
      : chat.kind === "channel"
        ? "rightPanel.channel"
        : "rightPanel.group",
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("rightPanel.chatInfo")}
      description={chat.title}
      closeLabel={t("rightPanel.close")}
      width={380}
    >
      <div className="g-chat-info">
        <ChatAvatar chat={chat} size={88} loader={onLoadAvatar} />
        <div className="g-chat-info-heading">
          <h2>
            {chat.title}
            {chat.verified ? (
              <Icon
                name="verified"
                size={17}
                filled
                className="g-chat-verified"
                label={t("chat.verified")}
              />
            ) : null}
          </h2>
          <span>{kind}</span>
        </div>

        <dl className="g-chat-info-facts">
          {chat.username ? (
            <div>
              <dt>{t("chat.username")}</dt>
              <dd>@{chat.username.replace(/^@/, "")}</dd>
            </div>
          ) : null}
          {chat.kind !== "private" ? (
            <div>
              <dt>{t("chat.membersLabel")}</dt>
              <dd>{chat.memberCount ?? chat.members ?? t("chat.group")}</dd>
            </div>
          ) : null}
          {chat.preview ? (
            <div>
              <dt>{t("chat.preview")}</dt>
              <dd>{chat.preview}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </Dialog>
  );
}
