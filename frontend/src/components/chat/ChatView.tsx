import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Browser, Events } from "@wailsio/runtime";
import { openTelegramLink } from "../../lib/telegramLinks";
import type {
  BotCallbackResult,
  BotWebViewRequest,
  Chat,
  ChatInfo,
  ChatMembersPage,
  ChatProfile,
  DownloadTask,
  Message,
  MessageButton,
  SharedMediaPage,
  SharedMediaSection,
  UploadProgress,
} from "../../types";
import { chatColor, chatInitials } from "../../data/telegram";
import { Button, Dialog, EmptyState, Spinner } from "../../ui";
import type {
  OpenMediaViewerPayload,
  ViewerAuthor,
  ViewerSource,
} from "../media/types";
import { viewerItemFor, viewerItemsFrom } from "../media/types";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { ChatInfoPanel } from "./ChatInfoPanel";
import { ForwardDialog } from "./ForwardDialog";
import { ReactionPickerDialog } from "./ReactionPickerDialog";
import "./info-panel-f.css";

interface ChatViewProps {
  chat: Chat;
  chats: Chat[];
  messages: Message[];
  /** Opens the detached viewer window with the given media session. */
  onOpenMediaViewer: (payload: OpenMediaViewerPayload) => Promise<void>;
  onLoadChatInfo: (chatID: string, kind: Chat["kind"]) => Promise<ChatInfo | null>;
  onLoadChatProfile: (
    chatID: string,
    kind: Chat["kind"],
  ) => Promise<ChatProfile | null>;
  onLoadMembersPage: (
    chatID: string,
    offset: number,
  ) => Promise<ChatMembersPage>;
  onLoadSharedMedia: (
    chatID: string,
    section: SharedMediaSection,
    beforeID: number,
  ) => Promise<SharedMediaPage>;
  onArchiveChat: (chat: Chat) => void;
  onSendBotCallback: (
    chatID: string,
    messageID: number,
    data: string,
  ) => Promise<BotCallbackResult | null>;
  onOpenBotWebView: (request: BotWebViewRequest) => void;
  onSendCommand: (command: string) => Promise<void>;
  onRequestLeaveChat?: (chat: Chat) => void;
  onOpenLinkedChat?: (chatID: string) => void;
  /** Network params for auxiliary kernel RPCs (sticker/GIF picker). */
  network: { proxy: string; ntp: string };
  onSendSticker: (ref: string, replyToID?: number) => Promise<void>;
  onSendGif: (ref: string, replyToID?: number) => Promise<void>;
  /** Message id to scroll to after an in-app t.me post link opened this chat. */
  jumpToMessageId?: number | null;
  onJumpConsumed?: () => void;
  onLoadAround?: (messageID: number) => Promise<boolean>;
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
  onOpenMediaViewer,
  onLoadChatInfo,
  onLoadChatProfile,
  onLoadMembersPage,
  onLoadSharedMedia,
  onArchiveChat,
  onSendBotCallback,
  onOpenBotWebView,
  onSendCommand,
  onRequestLeaveChat,
  onOpenLinkedChat,
  network,
  onSendSticker,
  onSendGif,
  jumpToMessageId,
  onJumpConsumed,
  onLoadAround,
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
  const [profile, setProfile] = useState<ChatProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);
  const [profileReload, setProfileReload] = useState(0);
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
    setForwarding(null);
    setReplyingTo(null);
    setEditing(null);
    setReactionFor(null);
    setDeleteRequest(null);
    setProfile(null);
    setProfileFailed(false);
  }, [chat.id]);

  // The kernel returns the full peer profile (bio, username, link, bot commands
  // and rights) for the info pane and the composer's capability switch.
  useEffect(() => {
    let alive = true;
    setProfileLoading(true);
    setProfileFailed(false);
    void onLoadChatProfile(chat.id, chat.kind)
      .then((next) => {
        if (!alive) {
          return;
        }
        if (next) {
          setProfile(next);
        } else {
          setProfileFailed(true);
        }
      })
      .catch(() => {
        if (alive) {
          setProfileFailed(true);
        }
      })
      .finally(() => {
        if (alive) {
          setProfileLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [chat.id, chat.kind, onLoadChatProfile, profileReload]);

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

  // The detached window pages through the loaded chat media, oldest first.
  // Opening from the info pane pages through that tab's list instead.
  const chatViewerItems = useMemo(() => viewerItemsFrom(messages), [messages]);

  const openViewer = useCallback(
    (message: Message, _source?: ViewerSource, mediaItems?: Message[]) => {
      const list = mediaItems
        ? viewerItemsFrom([...mediaItems].reverse())
        : chatViewerItems;
      const items = list.some((entry) => entry.message.id === message.id)
        ? list
        : (() => {
            const single = viewerItemFor(message);
            return single ? [single] : [];
          })();
      if (items.length === 0) {
        return;
      }
      const authors: Record<string, ViewerAuthor> = {};
      for (const entry of items) {
        authors[String(entry.message.id)] = authorFor(entry.message);
      }
      void onOpenMediaViewer({
        items,
        initialId: message.id,
        authors,
        chat: { id: chat.id, title: chat.title },
      }).catch(() => onToast(t("chat.loadMessagesFailed")));
    },
    [authorFor, chat.id, chat.title, chatViewerItems, onOpenMediaViewer, onToast, t],
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

  // t.me/<channel>/<post> links open this chat with the post to show. Once the
  // page containing the id is loaded, scroll to it (and consume the request).
  // When the post is older than the newest page, page the history around it.
  const aroundRequested = useRef(0);
  useEffect(() => {
    if (!jumpToMessageId) {
      return;
    }
    const loaded = messages.some((message) => message.id === jumpToMessageId);
    if (loaded) {
      jumpToMessage(jumpToMessageId);
      onJumpConsumed?.();
      return;
    }
    if (loading || messages.length === 0) {
      return;
    }
    if (aroundRequested.current === jumpToMessageId) {
      return;
    }
    aroundRequested.current = jumpToMessageId;
    if (!onLoadAround) {
      onToast(t("chat.postNotLoaded"));
      onJumpConsumed?.();
      return;
    }
    void onLoadAround(jumpToMessageId).then((found) => {
      if (!found) {
        onToast(t("chat.postNotLoaded"));
        onJumpConsumed?.();
      }
    });
    // jumpToMessage/onToast are stable enough for this one-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToMessageId, messages, loading]);

  // Actions taken in the detached viewer window come back as Wails events so
  // forwarding/deleting still use the chat's own pickers and confirmations.
  useEffect(() => {
    const off = Events.On("mediaViewer:action", (event) => {
      const data = event.data as
        | {
            kind?: "forward" | "delete" | "showInChat";
            chatId?: string;
            messageIds?: number[];
          }
        | undefined;
      if (!data || data.chatId !== chat.id || !data.messageIds?.length) {
        return;
      }
      const selected = data.messageIds
        .map((id) => messages.find((message) => message.id === id))
        .filter((message): message is Message => Boolean(message));
      if (data.kind === "showInChat") {
        jumpToMessage(data.messageIds[0]);
        return;
      }
      const first = selected[0];
      if (!first) {
        return;
      }
      if (data.kind === "forward") {
        setForwarding({ message: first, ids: data.messageIds });
      } else if (data.kind === "delete") {
        requestDelete(first, first.out);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, messages]);

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

  // Inline-keyboard callback buttons: message edits/new answers arrive through
  // the live chat-event stream; the RPC result only adds an alert or a URL.
  // Returning the promise lets the keyboard keep its press spinner.
  const handleBotCallback = (message: Message, button: MessageButton) => {
    if (!button.data) {
      return;
    }
    return onSendBotCallback(chat.id, message.id, button.data)
      .then((result) => {
        if (!result) {
          return;
        }
        if (result.alert) {
          onToast(result.alert);
        }
        if (result.url) {
          void Browser.OpenURL(result.url);
        }
      })
      .catch(() => {
        // App already reported the failure in a toast.
      });
  };

  const handleBotWebView = (message: Message, button: MessageButton) =>
    onOpenBotWebView({
      chatId: chat.id,
      botId: message.senderId ?? "",
      messageId: message.id,
      url: button.url ?? "",
      fromBotMenu: false,
      title: button.text,
      simple: button.kind === "webview_simple",
    });

  // The bot's menu button lives in the composer; in a private bot chat the peer
  // is the bot itself, so its opaque chat id doubles as the bot peer id.
  const openBotMenu = () => {
    const menu = profile?.botMenuButton;
    onOpenBotWebView({
      chatId: chat.id,
      botId: chat.id,
      messageId: 0,
      url: menu?.url ?? "",
      fromBotMenu: true,
      title: menu?.text || chat.title,
    });
  };

  const focusComposer = () => {
    setInfoOpen(false);
    window.setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>(
          ".f-composer-input, .tg-composer-input, .composer-input",
        )
        ?.focus();
    }, 60);
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
          savedMessagesCount={chat.saved ? profile?.messagesCount : undefined}
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
          onTogglePin={onTogglePin}
          onMarkRead={onMarkRead}
          onArchive={onArchiveChat}
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
          ) : chat.saved && messages.length === 0 ? (
            <EmptyState
              icon="bookmark"
              title={t("chat.savedEmptyTitle")}
              description={t("chat.savedEmptyDescription")}
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
              onBotCallback={handleBotCallback}
              onBotWebView={handleBotWebView}
              onToast={onToast}
            />
          )}
        </div>

        <ChatComposer
          key={chat.id}
          chatId={chat.id}
          chat={chat}
          profile={profile}
          profileLoading={profileLoading}
          hasMessages={Boolean(loading) || messages.length > 0}
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
          onOpenBotMenu={openBotMenu}
          onSendCommand={onSendCommand}
          onToggleMute={() => onToggleMute(chat.id)}
          network={network}
          onSendSticker={(ref) => onSendSticker(ref, replyingTo?.id)}
          onSendGif={(ref) => onSendGif(ref, replyingTo?.id)}
          onToast={onToast}
          enterToSend={enterToSend}
        />

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
          profile={profile}
          profileLoading={profileLoading}
          profileFailed={profileFailed}
          onRetryProfile={() => setProfileReload((value) => value + 1)}
          onSearchInChat={() => setSearchOpen(true)}
          onArchiveChat={() => onArchiveChat(chat)}
          onOpenBotWebView={openBotMenu}
          onFocusComposer={focusComposer}
          onLeaveChat={() => onRequestLeaveChat?.(chat)}
          onOpenDiscussion={(chatID) => onOpenLinkedChat?.(chatID)}
          onOpenLink={openTelegramLink}
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


