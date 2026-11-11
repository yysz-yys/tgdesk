import { useTranslation } from "react-i18next";
import {
  IconChecks,
  IconLoader2,
  IconDots,
  IconDownload,
  IconInfoCircle,
  IconSearch,
  IconSelectAll,
  IconX,
} from "@tabler/icons-react";
import type { Chat, Message } from "../../types";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { MessageList } from "./MessageList";

interface ChatViewProps {
  chat: Chat;
  messages: Message[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDownloadMessage: (id: number) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
  onOpenInfo: () => void;
  onToast: (message: string) => void;
  rightOpen: boolean;
  loading?: boolean;
  failed?: boolean;
}

export function ChatView({
  chat,
  messages,
  selectedIds,
  onToggleSelect,
  onDownloadMessage,
  onClearSelection,
  onSelectAll,
  onDownloadSelected,
  onDownloadAll,
  onOpenInfo,
  onToast,
  rightOpen,
  loading,
  failed,
}: ChatViewProps) {
  const { t } = useTranslation();
  const selectedCount = selectedIds.size;
  const subtitle =
    chat.kind === "private"
      ? chat.online
        ? t("chat.online")
        : t("chat.lastSeen")
      : (chat.members ?? t(chat.kind === "channel" ? "chat.channel" : "chat.group"));

  return (
    <main className="main-pane">
      <header className="chat-header">
        <Avatar
          title={chat.title}
          initials={chat.initials}
          color={chat.color}
          size={40}
          online={chat.online}
        />

        <div className="chat-header-copy">
          <div className="chat-header-title">{chat.title}</div>
          <div className="chat-header-subtitle" data-online={chat.online}>
            {chat.online && <span className="online-dot" />}
            {subtitle}
          </div>
        </div>

        <IconButton
          label={t("chat.searchInChat")}
          onClick={() => onToast(t("chat.searchToast"))}
        >
          <IconSearch size={21} stroke={1.8} />
        </IconButton>
        <IconButton label={t("chat.chatInfo")} active={rightOpen} onClick={onOpenInfo}>
          <IconInfoCircle size={21} stroke={1.8} />
        </IconButton>

        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="icon-button" aria-label={t("chat.chatMenu")}>
              <IconDots size={21} stroke={1.8} />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<IconSelectAll size={16} />} onSelect={onSelectAll}>
              {t("chat.selectAll")}
            </MenuItem>
            <MenuItem icon={<IconDownload size={16} />} onSelect={onDownloadAll}>
              {t("chat.downloadAll")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<IconInfoCircle size={16} />} onSelect={onOpenInfo}>
              {t("chat.chatInfo")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>

      {loading ? (
        <div className="message-status">
          <IconLoader2 className="login-spin" size={22} />
          <span>{t("chat.loadingMessages")}</span>
        </div>
      ) : failed ? (
        <div className="message-status">
          <span>{t("chat.loadMessagesFailed")}</span>
        </div>
      ) : (
        <MessageList
          chatId={chat.id}
          messages={messages}
          selectedIds={selectedIds}
          showSender={chat.kind === "group"}
          onToggleSelect={onToggleSelect}
          onDownloadMessage={onDownloadMessage}
          onToast={onToast}
        />
      )}

      <div className="bottom-bar">
        {selectedCount > 0 ? (
          <>
            <div className="bottom-hint">
              <IconChecks size={19} className="text-[var(--tg-accent)]" />
              <span>{t("chat.selected", { count: selectedCount })}</span>
            </div>
            <button type="button" className="secondary-button" onClick={onClearSelection}>
              <IconX size={16} />
              {t("chat.clear")}
            </button>
            <button type="button" className="primary-button" onClick={onDownloadSelected}>
              <IconDownload size={17} />
              {t("chat.download")}
            </button>
          </>
        ) : (
          <>
            <div className="bottom-hint">
              <IconChecks size={18} />
              <span>{t("chat.selectHint")}</span>
            </div>
            <button type="button" className="primary-button" onClick={onDownloadAll}>
              <IconDownload size={17} />
              {t("chat.downloadAll")}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
