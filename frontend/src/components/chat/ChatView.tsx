import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Chat, Message } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { ChatSearchBar } from "./ChatSearchBar";
import { ChannelBar } from "./ChannelBar";
import { MessageList } from "./MessageList";
import { SelectionBar } from "./SelectionBar";
import { ChatInfoDialog } from "./ChatInfoDialog";
import type { ChatAvatarLoader } from "./ChatAvatar";

interface ChatViewProps {
  chat: Chat;
  messages: Message[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDownloadMessage: (id: number) => void;
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onLoadAvatar: ChatAvatarLoader;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onToast: (message: string) => void;
  enterToSend: boolean;
  loading?: boolean;
  failed?: boolean;
  selfName: string;
  selfInitials: string;
  selfColor: string;
}

export function ChatView({
  chat,
  messages,
  selectedIds,
  onToggleSelect,
  onDownloadMessage,
  onLoadThumbnail,
  onLoadAvatar,
  onClearSelection,
  onSelectAll,
  onDownloadSelected,
  onDownloadAll,
  onSendMessage,
  onToast,
  enterToSend,
  loading,
  failed,
  selfName,
  selfInitials,
  selfColor,
}: ChatViewProps) {
  const { t } = useTranslation();
  const selectedCount = selectedIds.size;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setInfoOpen(false);
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
    <main className="g-chat-pane" aria-label={chat.title}>
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
        onInfo={() => setInfoOpen(true)}
        onLoadAvatar={onLoadAvatar}
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

      <div className="g-chat-canvas">
        {loading ? (
          <div className="g-chat-status">
            <Spinner size={24} label={t("chat.loadingMessages")} />
            <span>{t("chat.loadingMessages")}</span>
          </div>
        ) : failed ? (
          <EmptyState icon="cloud_off" title={t("chat.loadMessagesFailed")} />
        ) : query && filteredMessages.length === 0 ? (
          <EmptyState
            icon="search_off"
            title={t("chat.noSearchResults", { query: searchQuery.trim() })}
            description={t("chat.searchLoadedHint")}
          />
        ) : (
          <MessageList
            chatId={chat.id}
            chatTitle={chat.title}
            chatInitials={chat.initials}
            chatColor={chat.color}
            selfName={selfName}
            selfInitials={selfInitials}
            selfColor={selfColor}
            messages={filteredMessages}
            selectedIds={selectedIds}
            showSender={chat.kind === "group"}
            showAvatars={chat.kind !== "private"}
            onLoadAvatar={onLoadAvatar}
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

      <ChatInfoDialog
        chat={chat}
        open={infoOpen}
        onOpenChange={setInfoOpen}
        onLoadAvatar={onLoadAvatar}
      />
    </main>
  );
}
