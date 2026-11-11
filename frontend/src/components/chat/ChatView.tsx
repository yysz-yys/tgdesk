import { useTranslation } from "react-i18next";
import { IconLoader2 } from "@tabler/icons-react";
import type { Chat, Message } from "../../types";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { SelectionBar } from "./SelectionBar";
import "./chat.css";

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
  onSendMessage: (text: string) => Promise<void>;
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
  onSendMessage,
  onToast,
  rightOpen,
  loading,
  failed,
}: ChatViewProps) {
  const { t } = useTranslation();
  const selectedCount = selectedIds.size;

  return (
    <main className="main-pane tg-chat-pane">
      <ChatHeader
        chat={chat}
        rightOpen={rightOpen}
        onOpenInfo={onOpenInfo}
        onSelectAll={onSelectAll}
        onDownloadAll={onDownloadAll}
        onToast={onToast}
      />

      <div className="tg-chat-message-area">
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
      </div>

      {selectedCount > 0 ? (
        <SelectionBar
          count={selectedCount}
          onClear={onClearSelection}
          onDownload={onDownloadSelected}
        />
      ) : (
        <ChatComposer key={chat.id} onSend={onSendMessage} onToast={onToast} />
      )}
    </main>
  );
}
