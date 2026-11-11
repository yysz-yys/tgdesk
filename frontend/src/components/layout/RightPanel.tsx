import { useTranslation } from "react-i18next";
import {
  IconBell,
  IconDownload,
  IconFile,
  IconLink,
  IconSearch,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import type { Chat } from "../../types";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";

interface RightPanelProps {
  chat: Chat;
  onClose: () => void;
  onDownloadAll: () => void;
  onToast: (message: string) => void;
}

export function RightPanel({ chat, onClose, onDownloadAll, onToast }: RightPanelProps) {
  const { t } = useTranslation();
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
          <div className="info-section-title">{t("rightPanel.sharedMedia")}</div>
          <div className="media-grid">
            {Array.from({ length: 9 }).map((_, index) => (
              <div className="media-tile" key={index} />
            ))}
          </div>
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
