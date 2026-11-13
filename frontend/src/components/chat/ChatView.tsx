import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Chat,
  ChatInfo,
  ChatMembersPage,
  DownloadTask,
  Message,
  SharedMediaPage,
  SharedMediaSection,
  UploadProgress,
} from "../../types";
import { chatColor, chatInitials } from "../../data/telegram";
import { Button, Dialog, EmptyState, Spinner } from "../../ui";
import { MediaViewer } from "../media/MediaViewer";
import type {
  ViewerAuthor,
  ViewerItem,
  ViewerSource,
} from "../media/types";
import { viewerItemFor, viewerItemsFrom } from "../media/types";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { ChannelBar } from "./ChannelBar";
import { MessageList } from "./MessageList";
import { ChatInfoPanel } from "./ChatInfoPanel";
import { ForwardDialog } from "./ForwardDialog";
import { ReactionPickerDialog } from "./ReactionPickerDialog";
import "./info-panel-f.css";

interface ChatViewProps {
  chat: Chat;
  chats: Chat[];
  messages: Message[];
  onLoadVideo: (chatID: string, messageID: number) => Promise<string>;
  onLoadChatInfo: (chatID: string, kind: Chat["kind"]) => Promise<ChatInfo | null>;
  onLoadMembersPage: (
    chatID: string,
    offset: number,
  ) => Promise<ChatMembersPage>;
  onLoadSharedMedia: (
    chatID: string,
    section: SharedMediaSection,
    beforeID: number,
  ) => Promise<SharedMediaPage>;
  liveVersion?: number;
  downloads: DownloadTask[];
  onRefreshDownloads?: () => void;
  onDownloadMessage: (ids: number[]) => void;
  onDownloadInline: (ids: number[]) => void;
  onOpenDownloaded: (task: DownloadTask) => void;
  onPauseDownload: (task: DownloadTask) => void;
  onResumeDownload: (task: DownloadTask) => void;
  onDownloadAll: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onSendMessage: (text: string, replyToID?: number) => Promise<void>;
  onEditMessage: (messageID: number, text: string) => Promise<void>;
  onDeleteMessage: (messageIDs: number[], revoke: boolean) => Promise<void>;
  onForwardMessage: (messageIDs: number[], chatID: string) => Promise<void>;
  onReactMessage: (
    messageID: number,
    emoji: string,
    customEmojiID?: string,
  ) => Promise<void>;
  onToast: (message: string) => void;
  onAttach: (caption: string, replyToID?: number) => Promise<boolean>;
  upload?: UploadProgress;
  enterToSend: boolean;
  loading?: boolean;
  failed?: boolean;
  hasMoreMessages: boolean;
  olderMessagesLoading: boolean;
  onLoadOlder: () => void;
  selfName: string;
  selfInitials: string;
  selfColor: string;
  selfAvatarUrl?: string;
}

export function ChatView({
  chat,
  chats,
  messages,
  onLoadVideo,
  onLoadChatInfo,
  onLoadMembersPage,
  onLoadSharedMedia,
  liveVersion,
  downloads,
  onRefreshDownloads,
  onDownloadMessage,
  onDownloadInline,
  onOpenDownloaded,
  onPauseDownload,
  onResumeDownload,
  onDownloadAll,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onForwardMessage,
  onReactMessage,
  onToast,
  onAttach,
  upload,
  enterToSend,
  loading,
  failed,
  hasMoreMessages,
  olderMessagesLoading,
  onLoadOlder,
  selfName,
  selfInitials,
  selfColor,
  selfAvatarUrl,
}: ChatViewProps) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [viewer, setViewer] = useState<{
    items: ViewerItem[];
    activeId: number;
    source?: ViewerSource;
    /** Chat-history media follows the live message list (deletes advance it). */
    fromChat: boolean;
  } | null>(null);
  const [forwarding, setForwarding] = useState<{
    message: Message;
    ids: number[];
  } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [reactionFor, setReactionFor] = useState<Message | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<{
    message: Message;
    revoke: boolean;
    ids: number[];
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setInfoOpen(false);
    setViewer(null);
    setForwarding(null);
    setReplyingTo(null);
    setEditing(null);
    setReactionFor(null);
    setDeleteRequest(null);
  }, [chat.id]);

  // Escape cancels the reply/edit context even when focus moved away from the
  // textarea (for example right after choosing Reply from the context menu).
  useEffect(() => {
    if (!replyingTo && !editing) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setReplyingTo(null);
      setEditing(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, replyingTo]);

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

  // The viewer pages through the loaded chat media, oldest first. Opening from
  // the info pane instead pages through that tab's list (newest first → reverse).
  const chatViewerItems = useMemo(() => viewerItemsFrom(messages), [messages]);

  const closeViewer = useCallback(() => setViewer(null), []);

  const openViewer = useCallback(
    (message: Message, source?: ViewerSource, mediaItems?: Message[]) => {
      const list = mediaItems
        ? viewerItemsFrom([...mediaItems].reverse())
        : chatViewerItems;
      const fromChat = !mediaItems;
      if (list.some((entry) => entry.message.id === message.id)) {
        setViewer({ items: list, activeId: message.id, source, fromChat });
        return;
      }
      const single = viewerItemFor(message);
      if (single) {
        setViewer({ items: [single], activeId: message.id, source, fromChat });
      }
    },
    [chatViewerItems],
  );

  const viewerItems = useMemo(() => {
    if (!viewer) {
      return [];
    }
    if (!viewer.fromChat) {
      return viewer.items;
    }
    const byId = new Map(messages.map((message) => [message.id, message]));
    return viewer.items
      .filter((entry) => byId.has(entry.message.id))
      .map((entry) => viewerItemFor(byId.get(entry.message.id)!) ?? entry);
  }, [messages, viewer]);

  const authorFor = useCallback(
    (message: Message): ViewerAuthor => {
      if (message.out) {
        return {
          name: selfName,
          initials: selfInitials,
          color: selfColor,
          avatarUrl: selfAvatarUrl,
        };
      }
      return {
        name: message.sender || chat.title,
        initials: message.sender ? chatInitials(message.sender) : chat.initials,
        color: message.sender ? chatColor(message.sender) : chat.color,
        avatarUrl: message.senderAvatarUrl || chat.avatarUrl,
      };
    },
    [
      chat.avatarUrl,
      chat.color,
      chat.initials,
      chat.title,
      selfAvatarUrl,
      selfColor,
      selfInitials,
      selfName,
    ],
  );

  const sendOrEdit = async (text: string) => {
    if (editing) {
      await onEditMessage(editing.id, text);
      setEditing(null);
      onToast(t("chat.editedToast"));
      return;
    }
    await onSendMessage(text, replyingTo?.id);
    setReplyingTo(null);
  };

  const requestDelete = (
    message: Message,
    revoke: boolean,
    group?: Message[],
  ) => {
    setDeleteRequest({
      message,
      revoke,
      ids: group?.map((item) => item.id) ?? [message.id],
    });
  };

  const confirmDelete = async () => {
    if (!deleteRequest || deleting) {
      return;
    }
    setDeleting(true);
    try {
      await onDeleteMessage(deleteRequest.ids, deleteRequest.revoke);
      setDeleteRequest(null);
      onToast(t("chat.deletedToast"));
    } catch {
      onToast(t("chat.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const jumpToMessage = (id: number) => {
    const node =
      document.querySelector(`[data-message-id="${id}"]`) ??
      document.querySelector(`[data-album-ids~="${id}"]`);
    if (!node) {
      onToast(t("chat.replyNotLoaded"));
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("g-message-flash");
    window.setTimeout(() => node.classList.remove("g-message-flash"), 1400);
  };

  // Chat-info multi-selection reuses the same forward/delete flows as bubbles.
  const forwardSharedMedia = (selected: Message[]) => {
    if (selected.length === 0) {
      return;
    }
    setForwarding({ message: selected[0], ids: selected.map((item) => item.id) });
  };

  const deleteSharedMedia = (selected: Message[]) => {
    if (selected.length === 0) {
      return;
    }
    setDeleteRequest({
      message: selected[0],
      revoke: selected.every((item) => item.out),
      ids: selected.map((item) => item.id),
    });
  };

  return (
    <>
      <main className="g-chat-pane" aria-label={chat.title}>
        <ChatHeader
          chat={chat}
          infoOpen={infoOpen}
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
          onDownloadAll={onDownloadAll}
          onInfo={() =>
            setInfoOpen((open) => {
              const next = !open;
              if (next) {
                onRefreshDownloads?.();
              }
              return next;
            })
          }
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
              chatAvatarUrl={chat.avatarUrl}
              selfName={selfName}
              selfInitials={selfInitials}
              selfColor={selfColor}
              selfAvatarUrl={selfAvatarUrl}
              messages={filteredMessages}
              showSender={chat.kind === "group"}
              showAvatars={chat.kind !== "private"}
              hasMoreMessages={hasMoreMessages}
              olderMessagesLoading={olderMessagesLoading}
              onLoadOlder={onLoadOlder}
              onPlayVideo={openViewer}
              onOpenPhoto={openViewer}
              onReply={(message) => {
                setEditing(null);
                setReplyingTo(message);
              }}
              onEdit={(message) => {
                setReplyingTo(null);
                setEditing(message);
              }}
              onForward={(message, group) =>
                setForwarding({
                  message,
                  ids: group?.map((item) => item.id) ?? [message.id],
                })
              }
              onDelete={requestDelete}
              onJumpToMessage={jumpToMessage}
              onDownloadMessage={onDownloadMessage}
              downloads={downloads}
              onDownloadInline={onDownloadInline}
              onOpenDownloaded={onOpenDownloaded}
              onPauseDownload={onPauseDownload}
              onResumeDownload={onResumeDownload}
              onReact={(message, reaction) => {
                void onReactMessage(
                  message.id,
                  reaction?.emoji ?? "",
                  reaction?.customEmojiId,
                ).catch(() => onToast(t("chat.reactionFailed")));
              }}
              onOpenReactions={setReactionFor}
              onToast={onToast}
            />
          )}
        </div>

        {chat.kind === "channel" ? (
          <ChannelBar chat={chat} onToast={onToast} />
        ) : (
          <ChatComposer
            key={chat.id}
            chatId={chat.id}
            replyingTo={replyingTo}
            editing={editing}
            upload={upload}
            onCancelContext={() => {
              setReplyingTo(null);
              setEditing(null);
            }}
            onSend={sendOrEdit}
            onAttach={async (caption) => {
              const sent = await onAttach(caption, replyingTo?.id);
              if (sent) {
                setReplyingTo(null);
              }
              return sent;
            }}
            onToast={onToast}
            enterToSend={enterToSend}
          />
        )}

        {viewer ? (
          <MediaViewer
            items={viewerItems}
            initialId={viewer.activeId}
            source={viewer.source}
            authorOf={authorFor}
            onLoadVideo={onLoadVideo}
            onClose={closeViewer}
            onDownload={(message) => onDownloadInline([message.id])}
            onForward={(message) => setForwarding({ message, ids: [message.id] })}
            onDelete={(message) => requestDelete(message, message.out)}
            onShowInChat={(message) => {
              setViewer(null);
              jumpToMessage(message.id);
            }}
            onToast={onToast}
          />
        ) : null}

        <ForwardDialog
          open={Boolean(forwarding)}
          onOpenChange={(open) => {
            if (!open) {
              setForwarding(null);
            }
          }}
          chats={chats}
          currentChatId={chat.id}
          onForward={async (chatID) => {
            if (!forwarding) {
              return;
            }
            try {
              await onForwardMessage(forwarding.ids, chatID);
              setForwarding(null);
              onToast(t("chat.forwardedToast"));
            } catch {
              onToast(t("chat.forwardFailed"));
            }
          }}
        />

        <ReactionPickerDialog
          open={Boolean(reactionFor)}
          chosen={reactionFor?.reactions?.find((reaction) => reaction.chosen)?.emoji}
          onOpenChange={(open) => {
            if (!open) {
              setReactionFor(null);
            }
          }}
          onSelect={(emoji) => {
            if (!reactionFor) {
              return;
            }
            const messageID = reactionFor.id;
            setReactionFor(null);
            void onReactMessage(messageID, emoji).catch(() =>
              onToast(t("chat.reactionFailed")),
            );
          }}
        />

        <Dialog
          open={Boolean(deleteRequest)}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteRequest(null);
            }
          }}
          title={t("chat.deleteMessageTitle")}
          description={t(
            deleteRequest?.revoke
              ? "chat.deleteForEveryoneConfirm"
              : "chat.deleteMessageConfirm",
          )}
          closeLabel={t("rightPanel.close")}
          width="380px"
        >
          <div className="f-dialog-actions">
            <Button variant="ghost" onClick={() => setDeleteRequest(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {t("chat.delete")}
            </Button>
          </div>
        </Dialog>
      </main>

      {infoOpen ? (
        <ChatInfoPanel
          chat={chat}
          onClose={() => setInfoOpen(false)}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
          onMarkRead={onMarkRead}
          onLoadChatInfo={onLoadChatInfo}
          onLoadMembersPage={onLoadMembersPage}
          onLoadSharedMedia={onLoadSharedMedia}
          liveVersion={liveVersion}
          downloads={downloads}
          onDownloadInline={onDownloadInline}
          onOpenDownloaded={onOpenDownloaded}
          onPauseDownload={onPauseDownload}
          onResumeDownload={onResumeDownload}
          onOpenPhoto={openViewer}
          onPlayVideo={openViewer}
          onForwardMessage={(message) =>
            setForwarding({ message, ids: [message.id] })
          }
          onDeleteMessage={(message) => requestDelete(message, message.out)}
          onForwardMessages={forwardSharedMedia}
          onDeleteMessages={deleteSharedMedia}
          onJumpToMessage={jumpToMessage}
          onToast={onToast}
        />
      ) : null}
    </>
  );
}


