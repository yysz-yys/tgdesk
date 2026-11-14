import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Browser, Events } from "@wailsio/runtime";
import { Service as AppService } from "../bindings/tgdesk/internal/app";
import { resolveLanguage } from "./i18n";
import { setTelegramLinkNavigator } from "./lib/telegramLinks";
import {
  getChatGifts as getChatGiftsRPC,
  getPinnedMessage as getPinnedMessageRPC,
  getSavedChats as getSavedChatsRPC,
  unpinAllMessages as unpinAllMessagesRPC,
} from "./lib/telegramExtra";

import {
  mapChat,
  mapChatMember,
  mapChatProfile,
  mapMessage,
  isSavedMessagesChat,
  type KernelChat,
  type KernelMessage,
} from "./data/telegram";
import type { DownloadTaskDTO } from "../bindings/tgdesk/internal/kernel/models";
import type { ChatFolderDTO } from "../bindings/tgdesk/internal/kernel/models";
import type {
  AuthUser,
  BotCallbackResult,
  BotWebViewRequest,
  Chat,
  ChatEvent,
  ChatFolder,
  ChatInfo,
  ChatMembersPage,
  ChatProfile,
  DownloadEvent,
  DownloadTask,
  Message,
  MiniAppLaunch,
  SavedChats,
  SharedMediaPage,
  SharedMediaSection,
  TaskStatus,
  UploadEvent,
  UploadProgress,
} from "./types";
import { useSettings, type AppSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { AppTheme } from "./ui/theme";
import { Button, Dialog, EmptyState, Toast } from "./ui";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatView } from "./components/chat/ChatView";
import { MiniAppOverlay } from "./components/chat/MiniAppOverlay";
import { DownloadsView } from "./components/downloads/DownloadsView";
import { LoginScreen } from "./components/auth/LoginScreen";
import { LoginLoading } from "./components/auth/LoginLoading";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { ProfileHomeDialog } from "./components/settings/ProfileHomeDialog";

const TASK_STATUSES: TaskStatus[] = ["active", "queued", "paused", "done", "failed"];
/** Shared-media page size, close to Telegram Web's "a few screens" batch. */
const SHARED_MEDIA_PAGE_SIZE = 30;
/** Telegram Web loads 50 members first and then 200-row pages. */
const MEMBERS_PAGE_SIZE = 50;

/** Invite link waiting for the join confirmation dialog. */
interface JoinRequest {
  hash: string;
  title: string;
  members?: number;
  alreadyMember?: boolean;
  chat?: KernelChat | null;
}

function toDownloadTask(task: DownloadTaskDTO): DownloadTask {
  return {
    id: task.id,
    name: task.name,
    chat: task.chat,
    chatId: task.chatId,
    messageId: task.messageId,
    mediaKind: task.mediaKind || undefined,
    size: task.size,
    progress: task.progress,
    speed: task.speed || undefined,
    eta: task.eta || undefined,
    status: TASK_STATUSES.includes(task.status as TaskStatus)
      ? (task.status as TaskStatus)
      : "failed",
    ext: task.ext,
    color: task.color,
    error: task.error || undefined,
    path: task.path || undefined,
  };
}

function buildProxy(settings: AppSettings): string {
  if (settings.proxyType === "none") {
    return "";
  }
  const host = settings.proxyHost.trim();
  const port = settings.proxyPort.trim();
  if (!host || !port) {
    return "";
  }
  const username = settings.proxyUser.trim();
  const auth = username
    ? `${encodeURIComponent(username)}${settings.proxyPass ? `:${encodeURIComponent(settings.proxyPass)}` : ""}@`
    : "";
  return `${settings.proxyType}://${auth}${host}:${port}`;
}

/**
 * Merge a server history snapshot with messages appended by the live update
 * stream while that request was in flight. Only ids newer than the snapshot are
 * kept, so a refresh cannot resurrect a deleted older message.
 */
function mergeHistory(
  snapshot: KernelMessage[],
  current: KernelMessage[],
): KernelMessage[] {
  if (current.length === 0) {
    return snapshot;
  }
  const merged = new Map(snapshot.map((message) => [message.id, message]));
  const newest = snapshot.reduce((max, message) => Math.max(max, message.id), 0);
  for (const message of current) {
    if (message.id > newest && !merged.has(message.id)) {
      merged.set(message.id, message);
    }
  }
  return [...merged.values()].sort((left, right) => left.id - right.id);
}

export default function App() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const { settings, update } = useSettings();
  const resolvedTheme = useTheme(settings.theme);
  const [authChecked, setAuthChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [selfAvatar, setSelfAvatar] = useState("");
  const [authImportError, setAuthImportError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatDTOs, setChatDTOs] = useState<KernelChat[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [messageDTOs, setMessageDTOs] = useState<KernelMessage[]>([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [chatsLoading, setChatsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [chatsFailed, setChatsFailed] = useState(false);
  const [messagesFailed, setMessagesFailed] = useState(false);
  const [chatInfoVersion, setChatInfoVersion] = useState(0);
  const [portableDownloads, setPortableDownloads] = useState("");
  const [view, setView] = useState<"chats" | "downloads">("chats");
  const [query, setQuery] = useState("");
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  /** Message id to scroll to after an in-app t.me post link opens a chat. */
  const [pendingJumpId, setPendingJumpId] = useState<number | null>(null);
  /** Invite link waiting for the join confirmation dialog. */
  const [joinRequest, setJoinRequest] = useState<JoinRequest | null>(null);
  const [joining, setJoining] = useState(false);
  /** Channel/group waiting for the leave confirmation dialog. */
  const [leaveRequest, setLeaveRequest] = useState<Chat | null>(null);
  const [leaving, setLeaving] = useState(false);
  /** In-app bot Web App overlay (Telegram Web browser panel analogue). */
  const [miniApp, setMiniApp] = useState<MiniAppLaunch | null>(null);
  const [miniAppRecents, setMiniAppRecents] = useState<MiniAppLaunch[]>([]);
  /** Incremented by live pin/unpin updates so the pinned strip refreshes. */
  const [pinnedVersion, setPinnedVersion] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);
  // Telegram Web keeps the loaded history in memory so switching back to a
  // chat is instant. Same idea here; a background refresh replaces it.
  const messageCache = useRef(new Map<string, KernelMessage[]>());
  const refreshChatsBusy = useRef(false);
  const syncMessagesBusy = useRef(false);
  const newestMessageID = useRef(0);

  useEffect(() => {
    let alive = true;
    AppService.GetPaths()
      .then((value) => {
        if (alive && value?.downloads) {
          setPortableDownloads(value.downloads);
        }
      })
      .catch(() => {
        // Portable paths are optional for the UI shell.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!portableDownloads) {
      return;
    }
    const normalize = (value: string) => value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    const current = normalize(settings.downloadDir);
    // Reset only the old hard-coded default; a path the user picked anywhere on
    // disk stays untouched.
    if (!current || current === "d:\\downloads") {
      update("downloadDir", portableDownloads);
    }
  }, [portableDownloads, settings.downloadDir, update]);

  useEffect(() => {
    let alive = true;
    AppService.GetAuthStatus()
      .then((next) => {
        if (!alive) {
          return;
        }
        setAuthUser(next?.user ?? null);
        setLoggedIn(Boolean(next?.authorized));
        setAuthImportError(next?.importError ?? "");
      })
      .catch(() => {
        if (alive) {
          setLoggedIn(false);
        }
      })
      .finally(() => {
        if (alive) {
          setAuthChecked(true);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  // Opening a conversation clears its local unread badge. Telegram read state
  // is still backend-owned; this only keeps the shell honest until the read
  // API is available.
  useEffect(() => {
    if (!selectedChatId) {
      return;
    }
    setChatDTOs((current) => {
      const selected = current.find((chat) => chat.id === selectedChatId);
      if (!selected?.unread) {
        return current;
      }
      return current.map((chat) =>
        chat.id === selectedChatId ? { ...chat, unread: 0 } : chat,
      );
    });
  }, [selectedChatId]);

  useEffect(() => {
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    const language = resolveLanguage(settings.language);
    if (i18n.resolvedLanguage !== language) {
      void i18n.changeLanguage(language);
    }
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  }, [settings.language, i18n]);

  // The chat wallpaper becomes the window canvas for the signed-in app; the
  // login screen keeps its own quiet backdrop.
  useEffect(() => {
    document.documentElement.dataset.loggedIn = loggedIn ? "true" : "false";
  }, [loggedIn]);

  const proxyUrl = useMemo(() => buildProxy(settings), [settings]);

  // Telegram read state is server-owned: opening a chat and receiving messages
  // while it is focused must call messages.readHistory / channels.readHistory,
  // otherwise the next dialog refresh brings the unread badge back. Coalesce
  // bursts into one request per chat and only send it while the window is
  // actually visible and focused.
  const readSyncTimers = useRef<Record<string, number>>({});
  const syncChatRead = useCallback(
    (chatID: string) => {
      if (!loggedIn || !chatID) {
        return;
      }
      window.clearTimeout(readSyncTimers.current[chatID]);
      readSyncTimers.current[chatID] = window.setTimeout(() => {
        delete readSyncTimers.current[chatID];
        if (document.visibilityState !== "visible") {
          return;
        }
        void AppService.MarkChatsRead([chatID], proxyUrl, settings.ntp).catch(() => {
          // Keep the optimistic local state; the next dialogs refresh reconciles.
        });
      }, 400);
    },
    [loggedIn, proxyUrl, settings.ntp],
  );

  useEffect(() => {
    if (!selectedChatId || view !== "chats") {
      return;
    }
    syncChatRead(selectedChatId);
  }, [selectedChatId, view, syncChatRead]);

  useEffect(() => {
    const syncActiveChat = () => {
      if (selectedChatId && view === "chats") {
        syncChatRead(selectedChatId);
      }
    };
    window.addEventListener("focus", syncActiveChat);
    document.addEventListener("visibilitychange", syncActiveChat);
    return () => {
      window.removeEventListener("focus", syncActiveChat);
      document.removeEventListener("visibilitychange", syncActiveChat);
    };
  }, [selectedChatId, view, syncChatRead]);

  useEffect(
    () => () => {
      for (const timer of Object.values(readSyncTimers.current)) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  useEffect(() => {
    if (!loggedIn) {
      setSelfAvatar("");
      return;
    }
    let alive = true;
    void AppService.GetSelfAvatarURL(proxyUrl, settings.ntp)
      .then((url) => {
        if (alive) {
          setSelfAvatar(url ?? "");
        }
      })
      .catch(() => {
        // Initials remain the fallback when the profile photo is unavailable.
      });
    return () => {
      alive = false;
    };
  }, [loggedIn, proxyUrl, settings.ntp]);

  // Chat-info data follows Telegram Web: one counters call decides which tabs
  // exist, then every tab pages its own server-side search on demand. Nothing
  // is derived from the messages already loaded in the chat pane.
  const loadChatInfo = useCallback(
    async (chatID: string, kind: Chat["kind"]): Promise<ChatInfo | null> => {
      const info = await AppService.GetChatInfo(
        chatID,
        kind,
        proxyUrl,
        settings.ntp,
      );
      if (!info) {
        return null;
      }
      return {
        members: info.members ?? 0,
        canViewMembers: Boolean(info.canViewMembers),
        countsKnown: Boolean(info.countsKnown),
        counts: (info.counts ?? []).map((count) => ({
          section: count.section as SharedMediaSection,
          count: count.count ?? 0,
        })),
      };
    },
    [proxyUrl, settings.ntp],
  );

  const loadSharedMedia = useCallback(
    async (
      chatID: string,
      section: SharedMediaSection,
      beforeID: number,
    ): Promise<SharedMediaPage> => {
      const page = await AppService.GetSharedMedia(
        chatID,
        section,
        proxyUrl,
        settings.ntp,
        beforeID,
        SHARED_MEDIA_PAGE_SIZE,
      );
      return {
        items: (page?.messages ?? []).map((message) =>
          mapMessage(message, language, t),
        ),
        hasMore: Boolean(page?.hasMore),
        nextBeforeId: page?.nextBeforeId ?? 0,
      };
    },
    [language, proxyUrl, settings.ntp, t],
  );

  const loadChatMembersPage = useCallback(
    async (chatID: string, offset: number): Promise<ChatMembersPage> => {
      const page = await AppService.GetChatMembersPage(
        chatID,
        proxyUrl,
        settings.ntp,
        offset,
        MEMBERS_PAGE_SIZE,
      );
      return {
        members: (page?.members ?? []).map(mapChatMember),
        nextOffset: page?.nextOffset ?? 0,
        total: page?.total ?? 0,
      };
    },
    [proxyUrl, settings.ntp],
  );

  // Telegram Web loads the full peer profile (bio, username, link, bot info)
  // when the profile column opens; the kernel caches it for a minute.
  const loadChatProfile = useCallback(
    async (chatID: string, kind: Chat["kind"]): Promise<ChatProfile | null> => {
      const profile = await AppService.GetChatProfile(
        chatID,
        kind,
        proxyUrl,
        settings.ntp,
      );
      return profile ? mapChatProfile(profile, language, t) : null;
    },
    [language, proxyUrl, settings.ntp, t],
  );

  useEffect(() => {
    if (!loggedIn) {
      return;
    }
    let alive = true;
    AppService.RefreshUser(proxyUrl, settings.ntp)
      .then((user) => {
        if (alive && user) {
          setAuthUser(user);
        }
      })
      .catch(() => {
        // The cached/imported identity is enough until the network is reachable.
      });
    return () => {
      alive = false;
    };
  }, [loggedIn, proxyUrl, settings.ntp]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2600);
  }, []);

  // Raw Saved Messages source-chat DTOs, kept so a saved source chat that is
  // not in the dialog list can be opened like a resolved t.me link.
  const savedChatsRaw = useRef(new Map<string, KernelChat>());

  // Resolved t.me links insert the peer into the dialog list and select it,
  // exactly like Telegram Web opening a username/post link in-app.
  const mergeResolvedChat = useCallback((chat: KernelChat) => {
    savedChatsRaw.current.set(chat.id, chat);
    setChatDTOs((current) => {
      const known = current.some((item) => item.id === chat.id);
      if (known) {
        return current.map((item) =>
          item.id === chat.id ? { ...item, ...chat } : item,
        );
      }
      return [...current, chat];
    });
    setSelectedChatId(chat.id);
    setView("chats");
  }, []);

  // Saved Messages 2.0: source chats from messages.getSavedDialogs.
  const loadSavedChats = useCallback(async (): Promise<SavedChats | null> => {
    const dto = await getSavedChatsRPC(proxyUrl, settings.ntp);
    if (!dto) {
      return null;
    }
    const chats: Chat[] = [];
    for (const raw of dto.chats ?? []) {
      savedChatsRaw.current.set(raw.id, raw);
      chats.push(mapChat(raw, language, t));
    }
    return { chats, count: dto.count || chats.length };
  }, [language, proxyUrl, settings.ntp, t]);

  const openSavedChat = useCallback(
    (chatID: string) => {
      const raw = savedChatsRaw.current.get(chatID);
      if (raw) {
        mergeResolvedChat(raw);
        return;
      }
      openChat(chatID);
    },
    [mergeResolvedChat],
  );

  const loadChatGifts = useCallback(
    (chatID: string, offset?: string) =>
      getChatGiftsRPC(chatID, offset ?? "", 40, proxyUrl, settings.ntp),
    [proxyUrl, settings.ntp],
  );

  useEffect(() => {
    if (!loggedIn) {
      return;
    }
    setTelegramLinkNavigator(async (link) => {
      try {
        const resolved = await AppService.ResolveTelegramLink(
          link.url,
          proxyUrl,
          settings.ntp,
        );
        if (!resolved) {
          return false;
        }
        if (resolved.kind === "chat" && resolved.chat) {
          mergeResolvedChat(resolved.chat);
          if (resolved.messageId) {
            setPendingJumpId(resolved.messageId);
          }
          return true;
        }
        if (resolved.kind === "invite") {
          if (resolved.alreadyMember && resolved.chat) {
            mergeResolvedChat(resolved.chat);
            return true;
          }
          setJoinRequest({
            hash: resolved.inviteHash ?? "",
            title: resolved.inviteTitle || t("chat.inviteTitle"),
            members: resolved.inviteMembers,
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    });
    return () => setTelegramLinkNavigator(null);
  }, [loggedIn, mergeResolvedChat, proxyUrl, settings.ntp, t]);

  const confirmJoin = async () => {
    if (!joinRequest || joining) {
      return;
    }
    setJoining(true);
    try {
      const chat = await AppService.JoinByInvite(
        joinRequest.hash,
        proxyUrl,
        settings.ntp,
      );
      if (chat) {
        mergeResolvedChat(chat);
      }
      setJoinRequest(null);
      showToast(t("chat.joinedChat"));
    } catch {
      showToast(t("chat.joinFailed"));
    } finally {
      setJoining(false);
    }
  };

  const rememberMiniApp = useCallback((launch: MiniAppLaunch) => {
    setMiniApp(launch);
    setMiniAppRecents((current) => {
      const without = current.filter((item) => item.url !== launch.url);
      return [launch, ...without].slice(0, 8);
    });
  }, []);

  // Leaving a channel/group asks for confirmation like Telegram, then removes
  // the dialog from the local list and lets the selection effect pick the next.
  const requestLeaveChat = useCallback((target: Chat) => {
    setLeaveRequest(target);
  }, []);

  const confirmLeaveChat = async () => {
    if (!leaveRequest || leaving) {
      return;
    }
    setLeaving(true);
    try {
      await AppService.LeaveChat(leaveRequest.id, proxyUrl, settings.ntp);
      const leftID = leaveRequest.id;
      setChatDTOs((current) => current.filter((item) => item.id !== leftID));
      messageCache.current.delete(leftID);
      setSelectedChatId((current) => (current === leftID ? "" : current));
      setLeaveRequest(null);
      showToast(t("chat.leftChat"));
    } catch {
      showToast(t("chat.leaveFailed"));
    } finally {
      setLeaving(false);
    }
  };

  const openLinkedChat = useCallback(
    (chatID: string, linkedChat?: Chat) => {
      const target = chatDTOs.find((item) => item.id === chatID);
      if (target) {
        setSelectedChatId(chatID);
        setView("chats");
        return;
      }
      // Telegram Web opens a channel's linked discussion even when it is not
      // in the dialog list; the full profile carries the mapped chat entity.
      if (linkedChat) {
        mergeResolvedChat({
          id: linkedChat.id,
          title: linkedChat.title,
          kind: linkedChat.kind,
          username: linkedChat.username,
          preview: linkedChat.preview,
          avatarUrl: linkedChat.avatarUrl,
          members: linkedChat.memberCount,
          online: linkedChat.online,
          lastSeen: linkedChat.lastSeen,
          status: linkedChat.status,
        });
        return;
      }
      showToast(t("chat.linkedChatUnavailable"));
    },
    [chatDTOs, mergeResolvedChat, showToast, t],
  );

  // Telegram Web keeps a pinned-message strip under the chat header. The
  // kernel resolves the first pinned message; live pin/unpin updates bump
  // pinnedVersion so the strip follows the server state.
  const loadPinnedMessage = useCallback(
    async (chatID: string): Promise<Message | null> => {
      const raw = await getPinnedMessageRPC(chatID, proxyUrl, settings.ntp);
      return raw ? mapMessage(raw, language, t) : null;
    },
    [language, proxyUrl, settings.ntp, t],
  );

  const unpinAllMessages = useCallback(
    async (chatID: string) => {
      await unpinAllMessagesRPC(chatID, proxyUrl, settings.ntp);
      setPinnedVersion((version) => version + 1);
    },
    [proxyUrl, settings.ntp],
  );

  // Opens a bot Web App in the in-app overlay (Telegram Web browser panel):
  // full webview buttons/menu go through messages.requestWebView, simple
  // webviews use their raw URL.
  const openBotWebView = useCallback(
    async (request: BotWebViewRequest) => {
      try {
        if (request.simple) {
          if (!request.url) {
            showToast(t("toasts.webAppFailed"));
            return;
          }
          rememberMiniApp({
            url: request.url,
            title: request.title || t("miniApp.windowTitle"),
            fromBotMenu: false,
            chatId: request.chatId,
            botId: request.botId,
            messageId: request.messageId,
            network: { proxy: proxyUrl, ntp: settings.ntp },
          });
          return;
        }
        const view = await AppService.RequestBotWebView(
          request.chatId,
          request.botId,
          request.messageId,
          request.url,
          request.fromBotMenu,
          proxyUrl,
          settings.ntp,
        );
        const url = view?.url || request.url;
        if (!url) {
          showToast(t("toasts.webAppFailed"));
          return;
        }
        rememberMiniApp({
          url,
          title: request.title || t("miniApp.windowTitle"),
          fromBotMenu: request.fromBotMenu,
          chatId: request.chatId,
          botId: request.botId,
          messageId: request.messageId,
          queryId: view?.queryId,
          network: { proxy: proxyUrl, ntp: settings.ntp },
        });
      } catch {
        showToast(t("toasts.webAppFailed"));
      }
    },
    [proxyUrl, rememberMiniApp, settings.ntp, showToast, t],
  );

  const chatState = useMemo(() => {
    // The archive query and the main dialog query can both contain a peer while
    // it is being moved. Keep one row and never let a stale non-archived copy
    // pull it back into the main list.
    const byID = new Map<string, KernelChat>();
    for (const chat of chatDTOs) {
      const existing = byID.get(chat.id);
      if (!existing) {
        byID.set(chat.id, chat);
        continue;
      }
      byID.set(chat.id, {
        ...existing,
        ...chat,
        archived: Boolean(existing.archived || chat.archived),
        unread: Math.max(existing.unread ?? 0, chat.unread ?? 0),
      });
    }
    return Array.from(byID.values()).map((chat) => {
      const mapped = mapChat(chat, language, t);
      // Telegram titles the self chat "Saved Messages" in the user's language
      // instead of the account name.
      if (isSavedMessagesChat(chat.id, authUser?.id)) {
        return {
          ...mapped,
          saved: true,
          title: t("chat.savedMessages"),
          initials: "S",
          // Saved Messages never shows an unread badge in Telegram.
          unread: undefined,
        };
      }
      return mapped;
    });
  }, [chatDTOs, language, t, authUser?.id]);

  const filteredChats = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return chatState;
    }

    return chatState.filter((chat) =>
      [chat.title, chat.preview, chat.username ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [chatState, query]);

  useEffect(() => {
    if (view !== "chats" || filteredChats.length === 0) {
      return;
    }
    if (!filteredChats.some((chat) => chat.id === selectedChatId)) {
      setSelectedChatId(
        (filteredChats.find((chat) => !chat.archived) ?? filteredChats[0]).id,
      );
    }
  }, [filteredChats, selectedChatId, view]);

  const selectedChat = chatState.find((chat) => chat.id === selectedChatId);
  const messages = useMemo(
    () => messageDTOs.map((message) => mapMessage(message, language, t)),
    [messageDTOs, language, t],
  );

  useEffect(() => {
    if (!loggedIn) {
      setChatDTOs([]);
      setSelectedChatId("");
      setChatsLoading(false);
      setChatsFailed(false);
      return;
    }

    let alive = true;
    let networkDone = false;
    let cachedChatsApplied = false;
    setChatsLoading(true);
    setChatsFailed(false);

    // Paint the last local snapshot immediately (official clients do the same
    // from their local database), then replace it with the network answer.
    void AppService.GetCachedChats()
      .then((cached) => {
        if (!alive || networkDone || !cached || cached.length === 0) {
          return;
        }
        cachedChatsApplied = true;
        setChatDTOs(cached);
        setChatsLoading(false);
        setSelectedChatId((current) => {
          if (cached.some((chat) => chat.id === current)) {
            return current;
          }
          return (cached.find((chat) => !chat.archived) ?? cached[0])?.id ?? "";
        });
      })
      .catch(() => {
        // A missing/corrupt cache only loses the head start.
      });

    // The main dialog list is the critical path. Archived chats and folders are
    // loaded independently so a slow/retrying auxiliary call cannot hold the
    // whole chat screen hostage.
    AppService.GetChats(proxyUrl, settings.ntp, 100, false)
      .then((list) => {
        networkDone = true;
        if (!alive) {
          return;
        }
        const next = list ?? [];
        setChatDTOs(next);
        setSelectedChatId((current) => {
          if (next.some((chat) => chat.id === current)) {
            return current;
          }
          return (next.find((chat) => !chat.archived) ?? next[0])?.id ?? "";
        });
        setChatsLoading(false);
      })
      .catch(() => {
        networkDone = true;
        if (!alive) {
          return;
        }
        if (cachedChatsApplied) {
          setChatsLoading(false);
          return;
        }
        setChatDTOs([]);
        setSelectedChatId("");
        setChatsFailed(true);
        setChatsLoading(false);
      });

    void Promise.all([
      AppService.GetArchivedChats(proxyUrl, settings.ntp, 100, false).catch(() => []),
      AppService.GetFolders(proxyUrl, settings.ntp).catch(() => []),
    ]).then(([archived, folderList]) => {
      if (!alive) {
        return;
      }
      if ((archived ?? []).length > 0) {
        setChatDTOs((current) => {
          const known = new Set(current.map((chat) => chat.id));
          return [
            ...current,
            ...(archived ?? []).filter((chat) => !known.has(chat.id)),
          ];
        });
      }
      setFolders(
        (folderList ?? []).map((folder: ChatFolderDTO) => ({
          id: folder.id,
          title: folder.title,
          emoticon: folder.emoticon || undefined,
          chatKeys: folder.chatKeys ?? [],
          excludeKeys: folder.excludeKeys ?? [],
          groups: folder.groups,
          broadcasts: folder.broadcasts,
          contacts: folder.contacts,
          nonContacts: folder.nonContacts,
          bots: folder.bots,
          excludeMuted: folder.excludeMuted,
          excludeRead: folder.excludeRead,
          excludeArchived: folder.excludeArchived,
        })),
      );
    });

    return () => {
      alive = false;
    };
  }, [loggedIn, proxyUrl, settings.ntp]);

  useEffect(() => {
    if (!loggedIn || !selectedChatId) {
      setMessageDTOs([]);
      setMessagesLoading(false);
      setMessagesFailed(false);
      return;
    }

    let alive = true;
    let networkDone = false;
    let diskApplied = false;
    const cached = messageCache.current.get(selectedChatId);
    setMessagesLoading(!cached);
    setMessagesFailed(false);
    setOlderMessagesLoading(false);
    setHasMoreMessages(true);
    setMessageDTOs(cached ?? []);
    if (!cached) {
      void AppService.GetCachedMessages(selectedChatId)
        .then((disk) => {
          if (!alive || networkDone || !disk || disk.length === 0) {
            return;
          }
          diskApplied = true;
          messageCache.current.set(selectedChatId, disk);
          setMessageDTOs(disk);
          setMessagesLoading(false);
        })
        .catch(() => {
          // No local snapshot; keep the normal loading state.
        });
    }
    AppService.GetMessages(selectedChatId, proxyUrl, settings.ntp, 50)
      .then((list) => {
        networkDone = true;
        if (alive) {
          setMessageDTOs((current) => {
            const next = mergeHistory(list ?? [], current);
            messageCache.current.set(selectedChatId, next);
            return next;
          });
          setHasMoreMessages((list ?? []).length >= 50);
        }
      })
      .catch(() => {
        networkDone = true;
        if (alive && !cached && !diskApplied) {
          setMessageDTOs([]);
          setMessagesFailed(true);
        }
      })
      .finally(() => {
        if (alive) {
          setMessagesLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [loggedIn, selectedChatId, proxyUrl, settings.ntp]);

  useEffect(() => {
    const off = Events.On("download:event", (event) => {
      const payload = event.data as DownloadEvent;
      if (!payload) {
        return;
      }
      if (payload.removed && payload.task) {
        setDownloads((current) => current.filter((task) => task.id !== payload.task!.id));
        return;
      }
      if (payload.task) {
        const next = payload.task;
        setDownloads((current) => {
          const index = current.findIndex((task) => task.id === next.id);
          if (index < 0) {
            return [...current, next];
          }
          const copy = current.slice();
          copy[index] = next;
          return copy;
        });
      }
    });
    return off;
  }, []);

  useEffect(() => {
    if (!loggedIn) {
      setDownloads([]);
      return;
    }
    let alive = true;
    AppService.GetDownloads()
      .then((list) => {
        if (alive) {
          setDownloads((list ?? []).map(toDownloadTask));
        }
      })
      .catch(() => {
        // The task list is auxiliary; the chat UI stays usable.
      });
    return () => {
      alive = false;
    };
  }, [loggedIn]);

  const active = useMemo(
    () =>
      downloads.filter(
        (task) => task.status === "active" || task.status === "queued" || task.status === "paused",
      ),
    [downloads],
  );
  const completed = useMemo(
    () => downloads.filter((task) => task.status === "done"),
    [downloads],
  );
  const failed = useMemo(
    () => downloads.filter((task) => task.status === "failed"),
    [downloads],
  );

  const openChat = (id: string) => {
    setSelectedChatId(id);
    setView("chats");
  };

  const openDownloads = () => {
    setView("downloads");
  };

  const togglePin = (id: string) => {
    const chat = chatDTOs.find((item) => item.id === id);
    const pinned = !chat?.pinned;
    setChatDTOs((current) =>
      current.map((item) => (item.id === id ? { ...item, pinned } : item)),
    );
    void AppService.SetChatPinned(id, pinned, proxyUrl, settings.ntp)
      .then(() => showToast(t("toasts.pinUpdated")))
      .catch(() => {
        setChatDTOs((current) =>
          current.map((item) =>
            item.id === id ? { ...item, pinned: !pinned } : item,
          ),
        );
        showToast(t("toasts.pinFailed"));
      });
  };

  const toggleArchive = (chat: Chat) => {
    const archived = !chat.archived;
    void AppService.SetChatArchived(chat.id, archived, proxyUrl, settings.ntp)
      .then(() => {
        setChatDTOs((current) =>
          current.map((item) =>
            item.id === chat.id ? { ...item, archived } : item,
          ),
        );
        showToast(t(archived ? "toasts.archived" : "toasts.unarchived"));
      })
      .catch(() => showToast(t("toasts.archiveFailed")));
  };

  const toggleMute = (id: string) => {
    const chat = chatDTOs.find((item) => item.id === id);
    const muted = !chat?.muted;
    setChatDTOs((current) =>
      current.map((item) => (item.id === id ? { ...item, muted } : item)),
    );
    void AppService.SetChatMuted(id, muted, proxyUrl, settings.ntp)
      .then(() => showToast(t("toasts.notificationUpdated")))
      .catch(() => {
        setChatDTOs((current) =>
          current.map((item) =>
            item.id === id ? { ...item, muted: !muted } : item,
          ),
        );
        showToast(t("toasts.notificationFailed"));
      });
  };

  const markChatsRead = (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    setChatDTOs((current) =>
      current.map((chat) =>
        ids.includes(chat.id) ? { ...chat, unread: 0 } : chat,
      ),
    );
    void AppService.MarkChatsRead(ids, proxyUrl, settings.ntp)
      .then(() => showToast(t("toasts.markedRead")))
      .catch(() => {
        showToast(t("toasts.markedReadFailed"));
        void refreshChats();
      });
  };

  const markRead = (id: string) => {
    void markChatsRead([id]);
  };

  const markAllRead = () => {
    const ids = chatState
      .filter((chat) => chat.archived && (chat.unread ?? 0) > 0)
      .map((chat) => chat.id);
    void markChatsRead(ids);
  };

  const startDownloads = async (
    chat: Chat,
    ids: number[],
    onlyLoadedMedia: boolean,
    openDownloadsPage: boolean,
  ) => {
    const mediaIds = onlyLoadedMedia
      ? messages
          .filter((message) => ids.includes(message.id) && message.media)
          .map((message) => message.id)
      : ids;
    if (mediaIds.length === 0) {
      showToast(t("toasts.noMedia"));
      return;
    }
    try {
      await AppService.StartDownload(
        chat.id,
        chat.title,
        mediaIds,
        proxyUrl,
        settings.ntp,
        settings.downloadDir,
        settings.template,
        {
          threads: settings.threads,
          pool: settings.pool,
          limit: settings.limit,
          skipSame: settings.skipSame,
          rewriteExt: settings.rewriteExt,
          takeout: settings.takeout,
          reconnectSeconds: settings.reconnectSeconds,
        },
      );
      setDownloads(((await AppService.GetDownloads()) ?? []).map(toDownloadTask));
      if (openDownloadsPage) {
        setView("downloads");
      }
    } catch {
      showToast(t("toasts.downloadStartFailed"));
    }
  };

  const refreshDownloads = useCallback(() => {
    void AppService.GetDownloads()
      .then((list) => setDownloads((list ?? []).map(toDownloadTask)))
      .catch(() => {
        // Auxiliary state; the panel keeps working if this fails.
      });
  }, []);

  // Done tasks are only path hints. Re-read them whenever a conversation is
  // opened or the window regains focus so a file deleted in Explorer cannot
  // leave a stale green check on a message bubble or in the info pane.
  useEffect(() => {
    if (loggedIn && selectedChatId) {
      refreshDownloads();
    }
  }, [loggedIn, selectedChatId, refreshDownloads]);

  useEffect(() => {
    if (!loggedIn) {
      return;
    }
    const refreshOnFocus = () => refreshDownloads();
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [loggedIn, refreshDownloads]);

  const queueDownloads = (chat: Chat, ids: number[], onlyLoadedMedia = false) =>
    startDownloads(chat, ids, onlyLoadedMedia, true);

  // Chat-info downloads stay on the conversation: the tile/row shows its own
  // progress ring instead of taking the user to the Downloads page.
  const downloadInline = (chat: Chat, ids: number[]) =>
    startDownloads(chat, ids, false, false);

  const downloadAll = (chat: Chat) => {
    if (chat.id !== selectedChatId) {
      showToast(t("toasts.openChatFirst"));
      return;
    }
    void queueDownloads(chat, messages.map((message) => message.id), true);
  };

  const pauseTask = (id: string) => {
    void AppService.PauseDownload(id)
      .then(() => showToast(t("toasts.paused")))
      .catch(() => showToast(t("toasts.downloadActionFailed")));
  };

  const resumeTask = (id: string) => {
    void AppService.ResumeDownload(id, proxyUrl, settings.ntp)
      .then(() => showToast(t("toasts.resumed")))
      .catch(() => showToast(t("toasts.downloadActionFailed")));
  };

  const retryTask = (id: string) => {
    void AppService.ResumeDownload(id, proxyUrl, settings.ntp)
      .then(() => showToast(t("toasts.retrying")))
      .catch(() => showToast(t("toasts.downloadActionFailed")));
  };

  const removeTask = (id: string) => {
    setDownloads((current) => current.filter((task) => task.id !== id));
    void AppService.CancelDownload(id).catch(() => {
      showToast(t("toasts.downloadActionFailed"));
    });
    showToast(t("toasts.removed"));
  };

  const openDownloadFolder = () => {
    void AppService.OpenDownloadFolder(settings.downloadDir).catch(() => {
      showToast(t("toasts.downloadActionFailed"));
    });
  };

  const openDownloadedTask = (task: DownloadTask) => {
    void (async () => {
      try {
        const exists = await AppService.ValidateDownload(task.id);
        setDownloads(
          ((await AppService.GetDownloads()) ?? []).map(toDownloadTask),
        );
        if (exists) {
          void AppService.OpenDownloadFolder(task.path ?? settings.downloadDir).catch(
            () => showToast(t("toasts.downloadActionFailed")),
          );
          return;
        }
        // The delivered file was deleted outside the app; treat the badge as a
        // normal download button and fetch the message again.
        const target =
          selectedChat?.id === task.chatId
            ? selectedChat
            : chatState.find((chat) => chat.id === task.chatId);
        if (target && task.messageId > 0) {
          await startDownloads(target, [task.messageId], false, false);
        } else {
          showToast(t("toasts.downloadStartFailed"));
        }
      } catch {
        showToast(t("toasts.downloadActionFailed"));
      }
    })();
  };

  const chooseDownloadFolder = () => {
    void AppService.ChooseDownloadFolder(
      settings.downloadDir,
      t("settings.downloads.folder"),
    )
      .then((directory) => {
        if (directory) {
          update("downloadDir", directory);
        }
      })
      .catch((error) => {
        if (!String(error).toLowerCase().includes("cancel")) {
          showToast(t("toasts.downloadActionFailed"));
        }
      });
  };

  const pauseAll = () => {
    const running = active.filter(
      (task) => task.status === "active" || task.status === "queued",
    );
    void Promise.all(running.map((task) => AppService.PauseDownload(task.id)))
      .then(() => showToast(t("toasts.allPaused")))
      .catch(() => showToast(t("toasts.downloadActionFailed")));
  };

  const resumeAll = () => {
    const paused = active.filter((task) => task.status === "paused");
    if (paused.length === 0) {
      return;
    }
    void Promise.all(
      paused.map((task) =>
        AppService.ResumeDownload(task.id, proxyUrl, settings.ntp),
      ),
    )
      .then(() => showToast(t("toasts.allResumed")))
      .catch(() => showToast(t("toasts.downloadActionFailed")));
  };

  const clearCompleted = () => {
    void AppService.ClearCompletedDownloads()
      .then(() => {
        setDownloads((current) => current.filter((task) => task.status !== "done"));
        showToast(t("toasts.completedCleared"));
      })
      .catch(() => showToast(t("toasts.downloadActionFailed")));
  };

  const clearFailed = () => {
    void AppService.ClearFailedDownloads()
      .then(() => {
        setDownloads((current) =>
          current.filter((task) => task.status !== "failed"),
        );
        showToast(t("toasts.failedCleared"));
      })
      .catch(() => showToast(t("toasts.downloadActionFailed")));
  };

  const refreshMessages = useCallback(async () => {
    if (!selectedChatId) {
      return;
    }
    const next = await AppService.GetMessages(
      selectedChatId,
      proxyUrl,
      settings.ntp,
      50,
    );
    setMessageDTOs((current) => {
      const merged = mergeHistory(next ?? [], current);
      messageCache.current.set(selectedChatId, merged);
      return merged;
    });
    setHasMoreMessages((next ?? []).length >= 50);
  }, [proxyUrl, selectedChatId, settings.ntp]);

  useEffect(() => {
    newestMessageID.current =
      messageDTOs.length > 0 ? messageDTOs[messageDTOs.length - 1].id : 0;
  }, [messageDTOs]);

  useEffect(() => {
    if (!loggedIn || !selectedChatId || messagesLoading) {
      return;
    }
    let alive = true;
    const sync = () => {
      if (
        !alive ||
        syncMessagesBusy.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }
      syncMessagesBusy.current = true;
      void AppService.GetNewMessages(
        selectedChatId,
        newestMessageID.current,
        proxyUrl,
        settings.ntp,
      )
        .then((incoming) => {
          if (!alive || !incoming?.length) {
            return;
          }
          setMessageDTOs((current) => {
            const merged = mergeHistory(incoming, current);
            messageCache.current.set(selectedChatId, merged);
            return merged;
          });
        })
        .catch(() => {
          // A transient poll failure is retried on the next tick.
        })
        .finally(() => {
          syncMessagesBusy.current = false;
        });
    };
    const timer = window.setInterval(sync, 2000);
    const onFocus = () => sync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        sync();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loggedIn, messagesLoading, proxyUrl, selectedChatId, settings.ntp]);

  const refreshChats = useCallback(async () => {    if (!loggedIn || refreshChatsBusy.current) {
      return;
    }
    refreshChatsBusy.current = true;
    try {
      const [list, archived] = await Promise.all([
        AppService.GetChats(proxyUrl, settings.ntp, 100, true),
        AppService.GetArchivedChats(proxyUrl, settings.ntp, 100, true).catch(() => []),
      ]);
      setChatDTOs([...(list ?? []), ...(archived ?? [])]);
    } catch {
      // A transient refresh failure leaves the current list untouched.
    } finally {
      refreshChatsBusy.current = false;
    }
  }, [loggedIn, proxyUrl, settings.ntp]);

  const sendMessage = async (text: string, replyToID?: number) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.SendMessage(
      selectedChatId,
      text,
      replyToID ?? 0,
      proxyUrl,
      settings.ntp,
    );
    await refreshMessages();
  };

  const editMessage = async (messageID: number, text: string) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.EditMessage(selectedChatId, messageID, text, proxyUrl, settings.ntp);
    await refreshMessages();
  };

  const deleteMessage = async (messageIDs: number[], revoke: boolean) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.DeleteMessages(
      selectedChatId,
      messageIDs,
      revoke,
      proxyUrl,
      settings.ntp,
    );
    const removed = new Set(messageIDs);
    setMessageDTOs((current) => {
      const next = current.filter((message) => !removed.has(message.id));
      messageCache.current.set(selectedChatId, next);
      return next;
    });
  };

  const forwardMessage = async (messageIDs: number[], chatID: string) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.ForwardMessages(
      selectedChatId,
      chatID,
      messageIDs,
      proxyUrl,
      settings.ntp,
    );
    if (chatID === selectedChatId) {
      await refreshMessages();
    }
  };

  const reactMessage = async (
    messageID: number,
    emoji: string,
    customEmojiID?: string,
  ) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.SendReaction(
      selectedChatId,
      messageID,
      emoji,
      customEmojiID ?? "",
      proxyUrl,
      settings.ntp,
    );
    await refreshMessages();
  };

  // Inline-keyboard callback buttons: the bot answers with an alert/toast, an
  // URL, or an edited/new message (the latter arrives through chat:event).
  const sendBotCallback = useCallback(
    async (
      chatID: string,
      messageID: number,
      dataHex: string,
    ): Promise<BotCallbackResult | null> => {
      try {
        const result = await AppService.SendBotCallback(
          chatID,
          messageID,
          dataHex,
          proxyUrl,
          settings.ntp,
        );
        if (!result) {
          return null;
        }
        return {
          alert: result.alert || undefined,
          url: result.url || undefined,
          cacheTime: result.cacheTime || undefined,
        };
      } catch (error) {
        showToast(t("toasts.botActionFailed"));
        throw error;
      }
    },
    [proxyUrl, settings.ntp, showToast, t],
  );

  const sendCommand = async (command: string) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    const text = command.startsWith("/") ? command : `/${command}`;
    await sendMessage(text);
  };

  // Sticker / GIF send from the picker (no upload; existing documents).
  const sendSticker = async (ref: string, replyToID?: number) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.SendSticker(
      selectedChatId,
      ref,
      replyToID ?? 0,
      proxyUrl,
      settings.ntp,
    );
    await refreshMessages();
  };

  const sendGif = async (ref: string, replyToID?: number) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.SendGif(
      selectedChatId,
      ref,
      replyToID ?? 0,
      proxyUrl,
      settings.ntp,
    );
    await refreshMessages();
  };

  // Inline-bot GIF search results carry a query id + result id instead of a
  // document ref, so they use messages.sendInlineBotResult.
  const sendInlineGif = async (
    queryId: number,
    resultId: string,
    replyToID?: number,
  ) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.SendInlineGif(
      selectedChatId,
      queryId,
      resultId,
      replyToID ?? 0,
      proxyUrl,
      settings.ntp,
    );
    await refreshMessages();
  };

  const attachFiles = async (caption: string, replyToID?: number) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    const paths = (await AppService.ChooseFiles(t("chat.attachTitle"))) ?? [];
    if (paths.length === 0) {
      return false;
    }
    try {
      for (let index = 0; index < paths.length; index += 1) {
        await AppService.SendAttachment(
          selectedChatId,
          paths[index],
          index === 0 ? caption : "",
          index === 0 ? replyToID ?? 0 : 0,
          proxyUrl,
          settings.ntp,
        );
      }
      await refreshMessages();
      return true;
    } catch {
      showToast(t("chat.attachFailed"));
      return false;
    }
  };

  // t.me/<channel>/<post> links: page the history around the post id so a post
  // older than the newest 50 messages can still be opened and scrolled to.
  const loadMessagesAround = useCallback(
    async (messageID: number): Promise<boolean> => {
      if (!selectedChatId) {
        return false;
      }
      try {
        const [page, found] = await AppService.GetMessagesAround(
          selectedChatId,
          messageID,
          50,
          proxyUrl,
          settings.ntp,
        );
        const list = page ?? [];
        if (list.length > 0) {
          setMessageDTOs((current) => {
            const byID = new Map(current.map((message) => [message.id, message]));
            for (const message of list) {
              byID.set(message.id, message);
            }
            const next = [...byID.values()].sort((left, right) => left.id - right.id);
            messageCache.current.set(selectedChatId, next);
            return next;
          });
        }
        return Boolean(found);
      } catch {
        return false;
      }
    },
    [proxyUrl, selectedChatId, settings.ntp],
  );

  const loadOlderMessages = useCallback(async () => {
    const oldestID = messageDTOs[0]?.id;
    if (!selectedChatId || !oldestID || olderMessagesLoading || !hasMoreMessages) {
      return;
    }
    setOlderMessagesLoading(true);
    try {
      const older =
        (await AppService.GetOlderMessages(
          selectedChatId,
          oldestID,
          proxyUrl,
          settings.ntp,
          50,
        )) ?? [];
      setMessageDTOs((current) => {
        const known = new Set(current.map((message) => message.id));
        const next = [...older.filter((message) => !known.has(message.id)), ...current];
        messageCache.current.set(selectedChatId, next);
        return next;
      });
      setHasMoreMessages(older.length >= 50);
    } catch {
      showToast(t("chat.loadMessagesFailed"));
    } finally {
      setOlderMessagesLoading(false);
    }
  }, [
    hasMoreMessages,
    messageDTOs,
    olderMessagesLoading,
    proxyUrl,
    selectedChatId,
    settings.ntp,
    showToast,
    t,
  ]);

  const handleChatEvent = useCallback(
    (payload: ChatEvent) => {
      const chatID = payload.chatId || "";
      const raw = payload.message as KernelMessage | undefined;
      const belongs = chatID !== "" && chatID === selectedChatId;

      // Real presence from updateUserStatus: patch the matching private row
      // (and therefore the open header) without reloading the dialog list.
      if (payload.kind === "presence" && payload.userId) {
        const prefix = `user:${payload.userId}:`;
        setChatDTOs((current) =>
          current.map((chat) =>
            chat.id.startsWith(prefix)
              ? {
                  ...chat,
                  online: Boolean(payload.online),
                  lastSeen: payload.lastSeen || 0,
                  status: payload.status,
                }
              : chat,
          ),
        );
        return;
      }

      if (payload.kind === "pinned") {
        if (!payload.chatId || payload.chatId === selectedChatId) {
          setPinnedVersion((version) => version + 1);
        }
        return;
      }

      // The open chat-info pane follows Telegram Web and refreshes its counters
      // and shared media when the conversation changes under it.
      if (
        belongs &&
        (payload.kind === "message" ||
          payload.kind === "edit" ||
          payload.kind === "delete")
      ) {
        setChatInfoVersion((version) => version + 1);
      }

      if (payload.kind === "message" || payload.kind === "edit") {
        if (!raw) {
          return;
        }
        if (belongs) {
          setMessageDTOs((current) => {
            const exists = current.some((message) => message.id === raw.id);
            const next = exists
              ? current.map((message) => (message.id === raw.id ? raw : message))
              : [...current, raw].sort((left, right) => left.id - right.id);
            messageCache.current.set(selectedChatId, next);
            return next;
          });
        }
        const preview =
          payload.kind === "message"
            ? raw.text || raw.media?.name || ""
            : undefined;
        setChatDTOs((current) => {
          let found = false;
          const next = current.map((chat) => {
            if (chat.id !== chatID) {
              return chat;
            }
            found = true;
            return {
              ...chat,
              preview: preview ? preview : chat.preview,
              lastMessageDate:
                payload.kind === "message" ? raw.date : chat.lastMessageDate,
              unread:
                payload.kind === "message" && !belongs && !raw.out
                  ? (chat.unread ?? 0) + 1
                  : belongs
                    ? 0
                    : chat.unread,
            };
          });
          if (!found && payload.kind === "message") {
            void refreshChats();
            return current;
          }
          return next;
        });
        if (belongs && payload.kind === "message") {
          syncChatRead(chatID);
        }
        return;
      }

      if (payload.kind === "delete") {
        const ids = payload.messageIds ?? [];
        if (ids.length === 0) {
          return;
        }
        if (chatID && chatID !== selectedChatId) {
          return;
        }
        const removed = new Set(ids);
        setMessageDTOs((current) => {
          const next = current.filter((message) => !removed.has(message.id));
          messageCache.current.set(selectedChatId, next);
          return next;
        });
        return;
      }

      if (payload.kind === "reaction") {
        if (!belongs || payload.messageId === undefined) {
          return;
        }
        setMessageDTOs((current) => {
          const next = current.map((message) =>
            message.id === payload.messageId
              ? { ...message, reactions: payload.reactions ?? [] }
              : message,
          );
          messageCache.current.set(selectedChatId, next);
          return next;
        });
        return;
      }

      if (payload.kind === "read") {
        if (!chatID) {
          return;
        }
        setChatDTOs((current) =>
          current.map((chat) =>
            chat.id === chatID
              ? { ...chat, unread: payload.unread ?? chat.unread }
              : chat,
          ),
        );
        return;
      }

      if (payload.kind === "readOutbox") {
        if (!belongs || payload.maxId === undefined) {
          return;
        }
        setMessageDTOs((current) => {
          const next = current.map((message) =>
            message.out && message.id <= (payload.maxId ?? 0)
              ? { ...message, checks: "read" }
              : message,
          );
          messageCache.current.set(selectedChatId, next);
          return next;
        });
        return;
      }

      if (payload.kind === "resync") {
        if (!chatID || chatID === selectedChatId) {
          void refreshMessages();
        }
        void refreshChats();
      }
    },
    [
      refreshChats,
      refreshMessages,
      selectedChatId,
      syncChatRead,
    ],
  );

  useEffect(() => {
    const off = Events.On("chat:event", (event) => {
      const payload = event.data as ChatEvent;
      if (payload) {
        handleChatEvent(payload);
      }
    });
    return off;
  }, [handleChatEvent]);

  useEffect(() => {
    setUpload(null);
  }, [selectedChatId]);

  useEffect(() => {
    const off = Events.On("upload:event", (event) => {
      const payload = event.data as UploadEvent;
      if (!payload) {
        return;
      }
      if (payload.done || payload.failed) {
        setUpload(null);
        if (payload.failed) {
          showToast(t("chat.uploadFailed"));
        }
        return;
      }
      if (payload.chatId === selectedChatId) {
        setUpload({
          id: payload.id,
          name: payload.name,
          progress: payload.progress,
        });
      }
    });
    return off;
  }, [selectedChatId, showToast, t]);



  const handleAuthenticated = useCallback((user: AuthUser) => {
    setAuthUser(user);
    setLoggedIn(true);
  }, []);

  const handleLogout = () => {
    void (async () => {
      try {
        await AppService.Logout();
        setAuthUser(null);
        setLoggedIn(false);
        setSettingsOpen(false);
        setChatDTOs([]);
        messageCache.current.clear();
        setMessageDTOs([]);
        setSelectedChatId("");
        setDownloads([]);
        setView("chats");
      } catch {
        showToast(t("toasts.logoutFailed"));
      }
    })();
  };

  if (!authChecked) {
    return (
      <AppTheme appearance={resolvedTheme}>
        <>
          <LoginLoading />
        </>
      </AppTheme>
    );
  }

  if (!loggedIn) {
    return (
      <AppTheme appearance={resolvedTheme}>
        <>
          <LoginScreen
            onAuthenticated={handleAuthenticated}
            proxy={proxyUrl}
            ntp={settings.ntp}
            importError={authImportError}
            settings={settings}
            onUpdate={update}
          />
        </>
      </AppTheme>
    );
  }

  return (
    <AppTheme appearance={resolvedTheme}>
      <>
      <div className="g-app-shell">
          <div className="f-shell">
            <Sidebar
              activeView={view}
              chats={filteredChats}
              selectedChatId={selectedChatId}
              query={query}
              onQueryChange={(value) => {
                setQuery(value);
                if (value) {
                  setView("chats");
                }
              }}
              onSelectChat={(id) => {
                setView("chats");
                openChat(id);
              }}
              onTogglePin={togglePin}
              onToggleMute={toggleMute}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
              onDownloadAll={downloadAll}
              onToggleArchive={toggleArchive}
              onToast={showToast}
              onChats={() => setView("chats")}
              onDownloads={openDownloads}
              onSettings={() => setSettingsOpen(true)}
              onLogout={() => void handleLogout()}
              activeDownloads={active.length}
              folders={folders}
              archivedCount={chatState.filter((chat) => chat.archived).length}
              accountRestricted={authUser?.restricted}
              accountRestriction={authUser?.restriction}
              accountName={authUser?.displayName ?? t("settings.general.telegramAccount")}
              accountInitials={authUser?.initials ?? "T"}
              accountColor={authUser?.color}
              accountPhoto={selfAvatar || undefined}
              accountUsername={authUser?.username || undefined}
              accountPhone={authUser?.phone || undefined}
              onProfile={() => setProfileOpen(true)}
              loading={chatsLoading}
              failed={chatsFailed}
            />

            {view === "downloads" ? (
              <div className="f-downloads-pane">
                <DownloadsView
                  active={active}
                  completed={completed}
                  failed={failed}
                  onPause={pauseTask}
                  onResume={resumeTask}
                  onRetry={retryTask}
                  onRemove={removeTask}
                  onPauseAll={pauseAll}
                  onResumeAll={resumeAll}
                  onClearCompleted={clearCompleted}
                  onClearFailed={clearFailed}
                  onOpenDownloadFolder={openDownloadFolder}
                />
              </div>
            ) : selectedChat ? (
              <ChatView
                chat={selectedChat}
                chats={chatState}
                messages={messages}
                downloads={downloads}
                onRefreshDownloads={refreshDownloads}
                onDownloadMessage={(ids) => {
                  if (selectedChat) {
                    void queueDownloads(selectedChat, ids);
                  }
                }}
                onDownloadInline={(ids) => {
                  if (selectedChat) {
                    void downloadInline(selectedChat, ids);
                  }
                }}
                onOpenDownloaded={openDownloadedTask}
                onPauseDownload={(task) => pauseTask(task.id)}
                onResumeDownload={(task) => resumeTask(task.id)}
                onOpenMediaViewer={async (payload) => {
                  await AppService.OpenMediaViewer(
                    JSON.stringify({
                      ...payload,
                      network: {
                        proxy: proxyUrl,
                        ntp: settings.ntp,
                        tdlStreaming: settings.tdlStreaming,
                      },
                    }),
                  );
                }}
                onLoadChatInfo={loadChatInfo}
                onLoadMembersPage={loadChatMembersPage}
                onLoadChatProfile={loadChatProfile}
                onLoadSharedMedia={loadSharedMedia}
                onArchiveChat={(chat) => toggleArchive(chat)}
                onSendBotCallback={sendBotCallback}
                onOpenBotWebView={openBotWebView}
                onSendCommand={sendCommand}
                onRequestLeaveChat={requestLeaveChat}
                onOpenLinkedChat={openLinkedChat}
                onLoadSavedChats={loadSavedChats}
                onOpenSavedChat={openSavedChat}
                onLoadChatGifts={loadChatGifts}
                onLoadPinnedMessage={loadPinnedMessage}
                onUnpinAllMessages={unpinAllMessages}
                pinnedVersion={pinnedVersion}
                network={{ proxy: proxyUrl, ntp: settings.ntp }}
                onSendSticker={sendSticker}
                onSendGif={sendGif}
                onSendInlineGif={sendInlineGif}
                jumpToMessageId={pendingJumpId}
                onJumpConsumed={() => setPendingJumpId(null)}
                onLoadAround={loadMessagesAround}
                liveVersion={chatInfoVersion}
                onDownloadAll={() => downloadAll(selectedChat)}
                onTogglePin={togglePin}
                onToggleMute={toggleMute}
                onMarkRead={markRead}
                onSendMessage={sendMessage}
                onEditMessage={editMessage}
                onDeleteMessage={deleteMessage}
                onForwardMessage={forwardMessage}
                onReactMessage={reactMessage}
                onAttach={attachFiles}
                upload={upload ?? undefined}
                onToast={showToast}
                enterToSend={settings.enterToSend}
                loading={messagesLoading}
                failed={messagesFailed}
                hasMoreMessages={hasMoreMessages}
                olderMessagesLoading={olderMessagesLoading}
                onLoadOlder={loadOlderMessages}
                selfName={authUser?.displayName ?? t("chat.you")}
                selfInitials={authUser?.initials ?? "Y"}
                selfColor={authUser?.color ?? "#7cacf8"}
                selfAvatarUrl={selfAvatar || undefined}
              />
            ) : (
              <main className="f-chat-pane f-chat-empty">
                <EmptyState
                  icon={chatsLoading ? "hourglass_top" : chatsFailed ? "cloud_off" : "forum"}
                  title={
                    chatsLoading
                      ? t("chat.loadingChats")
                      : chatsFailed
                        ? t("chat.loadChatsFailed")
                        : t("chat.noChats")
                  }
                  description={
                    !chatsLoading && !chatsFailed ? t("chat.noChatsDesc") : undefined
                  }
                />
              </main>
            )}
          </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onUpdate={update}
        onOpenDownloadFolder={openDownloadFolder}
        onChooseDownloadFolder={chooseDownloadFolder}
      />

      <ProfileHomeDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        name={authUser?.displayName ?? t("settings.general.telegramAccount")}
        initials={authUser?.initials ?? "T"}
        color={authUser?.color ?? "#7cacf8"}
        photo={selfAvatar || undefined}
        username={authUser?.username || undefined}
        phone={authUser?.phone || undefined}
        online={Boolean(authUser)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToast={showToast}
        onLogout={() => void handleLogout()}
      />

      {/* Invite links open a join confirmation inside the app, like Telegram. */}
      <Dialog
        open={Boolean(joinRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setJoinRequest(null);
          }
        }}
        title={t("chat.joinInviteTitle", {
          title: joinRequest?.title ?? t("chat.inviteTitle"),
        })}
        description={
          joinRequest?.members
            ? t("chat.joinInviteMembers", {
                title: joinRequest.title,
                count: joinRequest.members,
              })
            : t("chat.joinInviteDescription")
        }
        closeLabel={t("common.close")}
        width="380px"
      >
        <div className="f-dialog-actions">
          <Button variant="ghost" onClick={() => setJoinRequest(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={joining}
            onClick={() => void confirmJoin()}
          >
            {t("chat.join")}
          </Button>
        </div>
      </Dialog>

      {/* Leaving a channel/group asks for confirmation, like Telegram. */}
      <Dialog
        open={Boolean(leaveRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setLeaveRequest(null);
          }
        }}
        title={t("chat.leaveTitle", { title: leaveRequest?.title ?? "" })}
        description={t("chat.leaveDescription")}
        closeLabel={t("common.close")}
        width="380px"
      >
        <div className="f-dialog-actions">
          <Button variant="ghost" onClick={() => setLeaveRequest(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            disabled={leaving}
            onClick={() => void confirmLeaveChat()}
          >
            {t("profile.leave")}
          </Button>
        </div>
      </Dialog>

      {/* Telegram Web's in-app browser panel: non-modal so the chat stays live. */}
      <MiniAppOverlay
        app={miniApp}
        appearance={resolvedTheme}
        onClose={() => setMiniApp(null)}
        onToast={showToast}
        onOpenLink={(url) => void Browser.OpenURL(url)}
        recents={miniAppRecents}
      />

      {toastMessage ? <Toast message={toastMessage} /> : null}
      </>
    </AppTheme>
  );
}
