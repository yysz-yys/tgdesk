import { useTranslation } from "react-i18next";
import {
  IconBell,
  IconDownload,
  IconFile,
  IconLink,
  IconPhoto,
  IconSearch,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import type { Chat, Message } from "../../types";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";
import "./right-panel.css";

interface RightPanelProps {
  chat: Chat;
  messages: Message[];
  onClose: () => void;
  onDownloadAll: () => void;
  onToast: (message: string) => void;
}

export function RightPanel({ chat, messages, onClose, onDownloadAll, onToast }: RightPanelProps) {
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
        <span className="right-panel-title">{t("rightPanel.chatInfo")}</span>
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
            size={96}
            online={chat.online}
          />
          <div className="profile-name">{chat.title}</div>
          {chat.username && <div className="profile-username">{chat.username}</div>}
          <div className="profile-status">{subtitle}</div>

          <div className="profile-actions">
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
                  {message.media?.kind === "photo" ? (
                    <IconPhoto size={18} />
                  ) : (
                    <IconFile size={18} />
                  )}
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
        </div>
      </div>
    </aside>
  );
}
