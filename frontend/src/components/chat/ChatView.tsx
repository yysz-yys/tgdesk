import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Chat, Message } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { ChannelBar } from "./ChannelBar";
import { MessageList } from "./MessageList";
import { SelectionBar } from "./SelectionBar";
import { ChatInfoDialog } from "./ChatInfoDialog";
import { VideoPlayerDialog } from "./VideoPlayerDialog";
import type { ChatAvatarLoader } from "./ChatAvatar";

interface ChatViewProps {
  chat: Chat;
  messages: Message[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDownloadMessage: (id: number) => void;
  onLoadThumbnail: (chatID: string, messageID: number) => Promise<string>;
  onLoadAvatar: ChatAvatarLoader;
  onLoadVideo: (chatID: string, messageID: number) => Promise<string>;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onToast: (message: string) => void;
  enterToSend: boolean;
  loading?: boolean;
  failed?: boolean;
  hasMoreMessages: boolean;
  olderMessagesLoading: boolean;
  onLoadOlder: () => void;
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
  onLoadVideo,
  onClearSelection,
  onSelectAll,
  onDownloadSelected,
  onDownloadAll,
  onSendMessage,
  onToast,
  enterToSend,
  loading,
  failed,
  hasMoreMessages,
  olderMessagesLoading,
  onLoadOlder,
  selfName,
  selfInitials,
  selfColor,
}: ChatViewProps) {
  const { t } = useTranslation();
  const selectedCount = selectedIds.size;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<Message | null>(null);

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setInfoOpen(false);
    setPlayingVideo(null);
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
        searchQuery={searchQuery}
        searchResultCount={filteredMessages.length}
        onSearchQueryChange={setSearchQuery}
        onCloseSearch={() => {
          setSearchOpen(false);
          setSearchQuery("");
        }}
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
            hasMoreMessages={hasMoreMessages}
            olderMessagesLoading={olderMessagesLoading}
            onLoadOlder={onLoadOlder}
            onLoadAvatar={onLoadAvatar}
            onPlayVideo={setPlayingVideo}
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

      <VideoPlayerDialog
        open={Boolean(playingVideo)}
        onOpenChange={(open) => {
          if (!open) {
            setPlayingVideo(null);
          }
        }}
        title={playingVideo?.media?.name ?? t("media.video")}
        onLoad={() =>
          playingVideo
            ? onLoadVideo(playingVideo.chatId, playingVideo.id)
            : Promise.resolve("")
        }
      />
    </main>
  );
}
