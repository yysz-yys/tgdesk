import { useTranslation } from "react-i18next";
import {
  IconBell,
  IconDownload,
  IconFile,
  IconGift,
  IconLink,
  IconLogout,
  IconSearch,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import type { Chat, Message } from "../../types";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";
import { MediaThumb } from "../chat/MediaThumb";
import "./right-panel.css";

interface RightPanelProps {
  chat: Chat;
  messages: Message[];
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onClose: () => void;
  onDownloadAll: () => void;
  onToast: (message: string) => void;
}

export function RightPanel({
  chat,
  messages,
  onLoadThumbnail,
  onClose,
  onDownloadAll,
  onToast,
}: RightPanelProps) {
  const { t } = useTranslation();
  const sharedMedia = messages.filter((message) => message.media).slice(0, 9);
  const subtitle =
    chat.kind === "private"
      ? chat.online
        ? t("chat.online")
        : t("chat.lastSeen")
      : (chat.members ?? t(chat.kind === "channel" ? "chat.channel" : "chat.group"));

  return (
    <aside className="right-panel" aria-label={t("rightPanel.chatInfo")}>
      <div className="right-panel-header">
        <span className="sr-only">{t("rightPanel.chatInfo")}</span>
        <IconButton label={t("rightPanel.close")} onClick={onClose}>
          <IconX size={20} />
        </IconButton>
      </div>

      <div className="right-panel-scroll">
        <div className="profile-block">
          <Avatar
            title={chat.title}
            initials={chat.initials}
            color={chat.color}
            size={64}
            online={chat.online}
          />
          <div className="profile-name">{chat.title}</div>
          {chat.username && <div className="profile-username">{chat.username}</div>}
          <div className="profile-status">{subtitle}</div>

          <div className="profile-actions">
            {chat.kind === "channel" ? (
              <>
                <button
                  type="button"
                  className="profile-action"
                  onClick={() => onToast(t("rightPanel.muteToast", { title: chat.title }))}
                >
                  <IconBell size={19} />
                  {t("rightPanel.mute")}
                </button>
                <button
                  type="button"
                  className="profile-action"
                  onClick={() => onToast(t("rightPanel.giftSoon"))}
                >
                  <IconGift size={19} />
                  {t("rightPanel.gift")}
                </button>
                <button
                  type="button"
                  className="profile-action"
                  onClick={() => onToast(t("rightPanel.leaveSoon"))}
                >
                  <IconLogout size={19} />
                  {t("rightPanel.leave")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="profile-action"
                  onClick={() => onToast(t("rightPanel.muteToast", { title: chat.title }))}
                >
                  <IconBell size={19} />
                  {t("rightPanel.mute")}
                </button>
                <button
                  type="button"
                  className="profile-action"
                  onClick={() => onToast(t("rightPanel.searchToast"))}
                >
                  <IconSearch size={19} />
                  {t("rightPanel.search")}
                </button>
                <button
                  type="button"
                  className="profile-action"
                  onClick={onDownloadAll}
                >
                  <IconDownload size={19} />
                  {t("rightPanel.download")}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="info-section">
          <div className="info-section-title">
            <span>{t("rightPanel.sharedMedia")}</span>
            {sharedMedia.length > 0 ? (
              <button
                type="button"
                className="info-section-link"
                onClick={() => onToast(t("rightPanel.mediaToast"))}
              >
                {t("rightPanel.seeAll")}
              </button>
            ) : null}
          </div>
          {sharedMedia.length > 0 ? (
            <div className="media-grid">
              {sharedMedia.map((message) => (
                <button
                  type="button"
                  className="media-tile"
                  key={message.id}
                  data-kind={message.media?.kind}
                  title={message.media?.name}
                  onClick={() => onToast(t("rightPanel.mediaToast"))}
                >
                  <MediaThumb
                    chatID={message.chatId}
                    messageID={message.id}
                    alt={message.media?.name ?? ""}
                    onLoad={onLoadThumbnail}
                    className="media-thumb"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="info-empty">{t("rightPanel.noMedia")}</div>
          )}
        </div>

        <div className="info-section">
          <div className="info-section-title">{t("rightPanel.info")}</div>
          {chat.username && (
            <div className="info-row">
              <IconLink size={17} />
              <span>{chat.username}</span>
            </div>
          )}
          <div className="info-row">
            {chat.kind === "private" ? <IconUsers size={17} /> : <IconWorld size={17} />}
            <span>
              {chat.kind === "private"
                ? t("rightPanel.privateChat")
                : chat.kind === "group"
                  ? (chat.members ?? t("rightPanel.group"))
                  : (chat.members ?? t("rightPanel.channel"))}
            </span>
          </div>
          <div className="info-row">
            <IconFile size={17} />
            <span>{t("rightPanel.sharedFiles")}</span>
          </div>
          {chat.kind === "channel" ? (
            <>
              <button
                type="button"
                className="info-row info-row-action"
                onClick={() => onToast(t("rightPanel.leaveSoon"))}
              >
                <IconLogout size={17} />
                <span>{t("rightPanel.leaveChannel")}</span>
              </button>
              <button
                type="button"
                className="info-row info-row-action info-row-danger"
                onClick={() => onToast(t("rightPanel.reportSoon"))}
              >
                <IconX size={17} />
                <span>{t("rightPanel.report")}</span>
              </button>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
