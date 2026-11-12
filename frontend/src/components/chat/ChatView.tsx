import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconLoader2 } from "@tabler/icons-react";
import type { Chat, Message } from "../../types";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { ChatSearchBar } from "./ChatSearchBar";
import { ChannelBar } from "./ChannelBar";
import { MessageList } from "./MessageList";
import { SelectionBar } from "./SelectionBar";
import "./chat.css";

interface ChatViewProps {
  chat: Chat;
  messages: Message[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDownloadMessage: (id: number) => void;
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onToast: (message: string) => void;
  enterToSend: boolean;
  loading?: boolean;
  failed?: boolean;
}

export function ChatView({
  chat,
  messages,
  selectedIds,
  onToggleSelect,
  onDownloadMessage,
  onLoadThumbnail,
  onClearSelection,
  onSelectAll,
  onDownloadSelected,
  onDownloadAll,
  onSendMessage,
  onToast,
  enterToSend,
  loading,
  failed,
}: ChatViewProps) {
  const { t } = useTranslation();
  const selectedCount = selectedIds.size;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, [chat.id]);

  const query = searchQuery.trim().toLowerCase();
  const filteredMessages = useMemo(() => {
    if (!query) {
      return messages;
    }
    return messages.filter((message) =>
      `${message.sender ?? ""} ${message.text} ${message.media?.name ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [messages, query]);

  return (
    <main className="main-pane tg-chat-pane">
      <ChatHeader
        chat={chat}
        searchOpen={searchOpen}
        onSearch={() => {
          setSearchOpen((open) => !open);
          if (searchOpen) {
            setSearchQuery("");
          }
        }}
        onSelectAll={onSelectAll}
        onDownloadAll={onDownloadAll}
      />

      {searchOpen ? (
        <ChatSearchBar
          query={searchQuery}
          resultCount={filteredMessages.length}
          onQueryChange={setSearchQuery}
          onClose={() => {
            setSearchOpen(false);
            setSearchQuery("");
          }}
        />
      ) : null}

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
        ) : query && filteredMessages.length === 0 ? (
          <div className="message-status">
            <span>{t("chat.noSearchResults", { query: searchQuery.trim() })}</span>
          </div>
        ) : (
          <MessageList
            chatId={chat.id}
            messages={filteredMessages}
            selectedIds={selectedIds}
            showSender={chat.kind === "group"}
            onToggleSelect={onToggleSelect}
            onDownloadMessage={onDownloadMessage}
            onLoadThumbnail={onLoadThumbnail}
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
      ) : chat.kind === "channel" ? (
        <ChannelBar chat={chat} onToast={onToast} />
      ) : (
        <ChatComposer
          key={chat.id}
          chatId={chat.id}
          onSend={onSendMessage}
          onToast={onToast}
          enterToSend={enterToSend}
        />
      )}
    </main>
  );
}
