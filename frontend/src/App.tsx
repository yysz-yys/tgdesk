import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Events } from "@wailsio/runtime";
import { Service as AppService } from "../bindings/tgdesk/internal/app";
import { resolveLanguage } from "./i18n";

import {
  mapChat,
  mapMessage,
  type KernelChat,
  type KernelMessage,
} from "./data/telegram";
import type { DownloadTaskDTO } from "../bindings/tgdesk/internal/kernel/models";
import type { ChatFolderDTO } from "../bindings/tgdesk/internal/kernel/models";
import type {
  AuthUser,
  Chat,
  ChatFolder,
  DownloadEvent,
  DownloadTask,
  TaskStatus,
} from "./types";
import { useSettings, type AppSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { TooltipProvider } from "./components/ui/Tooltip";
import { Toast } from "./components/ui/Toast";
import { EmptyState } from "./components/ui/EmptyState";
import { Sidebar } from "./components/layout/Sidebar";
import { NavDrawer } from "./components/layout/NavDrawer";
import { ChatView } from "./components/chat/ChatView";
import { NewMessageDialog } from "./components/chat/NewMessageDialog";
import { DownloadsView } from "./components/downloads/DownloadsView";
import { LoginScreen } from "./components/auth/LoginScreen";
import { LoginLoading } from "./components/auth/LoginLoading";
import { SettingsDialog } from "./components/settings/SettingsDialog";

const TASK_STATUSES: TaskStatus[] = ["active", "queued", "paused", "done", "failed"];

function toDownloadTask(task: DownloadTaskDTO): DownloadTask {
  return {
    id: task.id,
    name: task.name,
    chat: task.chat,
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

export default function App() {
  const { t, i18n } = useTranslation();
  const { settings, update } = useSettings();
  useTheme(settings.theme);
  const [authChecked, setAuthChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authImportError, setAuthImportError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
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
  const [portableRoot, setPortableRoot] = useState("");
  const [portableDownloads, setPortableDownloads] = useState("");
  const [view, setView] = useState<"chats" | "downloads">("chats");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    AppService.GetPaths()
      .then((value) => {
        if (alive && value?.downloads) {
          setPortableRoot(value.root ?? "");
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
    if (!portableDownloads || !portableRoot) {
      return;
    }
    const normalize = (value: string) =>
      value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    const current = normalize(settings.downloadDir);
    const root = normalize(portableRoot);
    // Keep custom folders inside the portable root, but never keep a path
    // from another executable location (or an old default outside the root).
    if (!current || current === "d:\\downloads" || !current.startsWith(`${root}\\`)) {
      update("downloadDir", portableDownloads);
    }
  }, [portableRoot, portableDownloads, settings.downloadDir, update]);

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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedChatId]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds]);

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

  const proxyUrl = useMemo(() => buildProxy(settings), [settings]);

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

  const showToast = (message: string) => {
    setToastMessage(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2600);
  };

  const language = i18n.resolvedLanguage ?? "en";
  const chatState = useMemo(
    () => chatDTOs.map((chat) => mapChat(chat, language, t)),
    [chatDTOs, language, t],
  );

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
    setChatsLoading(true);
    setChatsFailed(false);
    Promise.all([
      AppService.GetChats(proxyUrl, settings.ntp, 100),
      AppService.GetArchivedChats(proxyUrl, settings.ntp, 100).catch(() => []),
      AppService.GetFolders(proxyUrl, settings.ntp).catch(() => []),
    ])
      .then(([list, archived, folderList]) => {
        if (!alive) {
          return;
        }
        const next = [...(list ?? []), ...(archived ?? [])];
        setChatDTOs(next);
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
        setSelectedChatId((current) => {
          if (next.some((chat) => chat.id === current)) {
            return current;
          }
          return (next.find((chat) => !chat.archived) ?? next[0])?.id ?? "";
        });
      })
      .catch(() => {
        if (!alive) {
          return;
        }
        setChatDTOs([]);
        setFolders([]);
        setSelectedChatId("");
        setChatsFailed(true);
      })
      .finally(() => {
        if (alive) {
          setChatsLoading(false);
        }
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
    setMessagesLoading(true);
    setMessagesFailed(false);
    setOlderMessagesLoading(false);
    setHasMoreMessages(true);
    setMessageDTOs([]);
    AppService.GetMessages(selectedChatId, proxyUrl, settings.ntp, 50)
      .then((list) => {
        if (alive) {
          setMessageDTOs(list ?? []);
          setHasMoreMessages((list ?? []).length >= 50);
        }
      })
      .catch(() => {
        if (alive) {
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
    setSelectedIds(new Set());
  };

  const togglePin = (id: string) => {
    setChatDTOs((current) =>
      current.map((chat) => (chat.id === id ? { ...chat, pinned: !chat.pinned } : chat)),
    );
    showToast(t("toasts.pinUpdated"));
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
    setChatDTOs((current) =>
      current.map((chat) => (chat.id === id ? { ...chat, muted: !chat.muted } : chat)),
    );
    showToast(t("toasts.notificationUpdated"));
  };

  const markRead = (id: string) => {
    setChatDTOs((current) =>
      current.map((chat) => (chat.id === id ? { ...chat, unread: 0 } : chat)),
    );
    showToast(t("toasts.markedRead"));
  };

  const queueDownloads = async (chat: Chat, ids: number[]) => {
    const mediaIds = messages
      .filter((message) => ids.includes(message.id) && message.media)
      .map((message) => message.id);
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
        settings.threads,
      );
      setDownloads(((await AppService.GetDownloads()) ?? []).map(toDownloadTask));
      setView("downloads");
    } catch {
      showToast(t("toasts.downloadStartFailed"));
    }
  };

  const downloadAll = (chat: Chat) => {
    if (chat.id !== selectedChatId) {
      showToast(t("toasts.openChatFirst"));
      return;
    }
    void queueDownloads(chat, messages.map((message) => message.id));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(messages.map((message) => message.id)));
    showToast(t("toasts.allSelected"));
  };

  const downloadSelected = () => {
    if (selectedIds.size === 0 || !selectedChat) {
      return;
    }
    void queueDownloads(selectedChat, Array.from(selectedIds));
    setSelectedIds(new Set());
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

  const openFolder = (task: DownloadTask) => {
    void AppService.OpenDownloadFolder(task.path ?? settings.downloadDir).catch(() => {
      showToast(t("toasts.downloadActionFailed"));
    });
  };

  const openDownloadFolder = () => {
    void AppService.OpenDownloadFolder(settings.downloadDir).catch(() => {
      showToast(t("toasts.downloadActionFailed"));
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

  const clearCompleted = () => {
    void AppService.ClearCompletedDownloads()
      .then(() => {
        setDownloads((current) => current.filter((task) => task.status !== "done"));
        showToast(t("toasts.completedCleared"));
      })
      .catch(() => showToast(t("toasts.downloadActionFailed")));
  };

  const loadThumbnail = useCallback(
    (chatID: string, messageID: number) =>
      AppService.GetMessageThumb(chatID, messageID, proxyUrl, settings.ntp),
    [proxyUrl, settings.ntp],
  );

  const loadChatAvatar = useCallback(
    (chatID: string) => AppService.GetChatAvatar(chatID, proxyUrl, settings.ntp),
    [proxyUrl, settings.ntp],
  );

  const loadMessageVideo = useCallback(
    (chatID: string, messageID: number) =>
      AppService.GetMessageMedia(chatID, messageID, proxyUrl, settings.ntp),
    [proxyUrl, settings.ntp],
  );

  const sendMessage = async (text: string) => {
    if (!selectedChatId) {
      throw new Error("No chat selected");
    }
    await AppService.SendMessage(selectedChatId, text, proxyUrl, settings.ntp);
    const next = await AppService.GetMessages(selectedChatId, proxyUrl, settings.ntp, 50);
    setMessageDTOs(next ?? []);
    setHasMoreMessages((next ?? []).length >= 50);
  };

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
        return [...older.filter((message) => !known.has(message.id)), ...current];
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
        setSelectedIds(new Set());
        setChatDTOs([]);
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
      <TooltipProvider delayDuration={350}>
        <LoginLoading />
      </TooltipProvider>
    );
  }

  if (!loggedIn) {
    return (
      <TooltipProvider delayDuration={350}>
        <LoginScreen
          onAuthenticated={handleAuthenticated}
          proxy={proxyUrl}
          ntp={settings.ntp}
          importError={authImportError}
          settings={settings}
          onUpdate={update}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={350}>
      <div className="g-app-shell">
        {view === "downloads" ? (
          <DownloadsView
            active={active}
            completed={completed}
            failed={failed}
            onPause={pauseTask}
            onResume={resumeTask}
            onRetry={retryTask}
            onRemove={removeTask}
            onOpenFolder={openFolder}
            onPauseAll={pauseAll}
            onClearCompleted={clearCompleted}
            onOpenDownloadFolder={openDownloadFolder}
            onMenu={() => setDrawerOpen(true)}
          />
        ) : (
          <>
            <Sidebar
              chats={filteredChats}
              selectedChatId={selectedChatId}
              query={query}
              onQueryChange={setQuery}
              onSelectChat={openChat}
              onTogglePin={togglePin}
              onToggleMute={toggleMute}
              onMarkRead={markRead}
              onDownloadAll={downloadAll}
              onToggleArchive={toggleArchive}
              onToast={showToast}
              onLoadAvatar={loadChatAvatar}
              onMenu={() => setDrawerOpen(true)}
              onCompose={() => setNewMessageOpen(true)}
              folders={folders}
              archivedCount={chatState.filter((chat) => chat.archived).length}
              accountRestricted={authUser?.restricted}
              accountRestriction={authUser?.restriction}
              loading={chatsLoading}
              failed={chatsFailed}
            />

            {selectedChat ? (
              <ChatView
                chat={selectedChat}
                messages={messages}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onDownloadMessage={(id) => {
                  if (selectedChat) {
                    void queueDownloads(selectedChat, [id]);
                  }
                }}
                onLoadThumbnail={loadThumbnail}
                onLoadAvatar={loadChatAvatar}
                onLoadVideo={loadMessageVideo}
                onClearSelection={() => setSelectedIds(new Set())}
                onSelectAll={selectAll}
                onDownloadSelected={downloadSelected}
                onDownloadAll={() => downloadAll(selectedChat)}
                onSendMessage={sendMessage}
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
              />
            ) : (
              <main className="g-app-main">
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
          </>
        )}
      </div>

      <NavDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        view={view}
        activeDownloads={active.length}
        onChats={() => {
          setView("chats");
          setDrawerOpen(false);
        }}
        onDownloads={() => {
          openDownloads();
          setDrawerOpen(false);
        }}
        onSettings={() => {
          setDrawerOpen(false);
          setSettingsOpen(true);
        }}
        onLogout={() => {
          setDrawerOpen(false);
          handleLogout();
        }}
        accountName={authUser?.displayName ?? t("settings.general.telegramAccount")}
        accountInitials={authUser?.initials ?? "T"}
        accountColor={authUser?.color ?? "#65aadd"}
        accountRestricted={authUser?.restricted}
      />

      <NewMessageDialog
        open={newMessageOpen}
        onOpenChange={setNewMessageOpen}
        chats={chatState}
        onSelect={(id) => {
          openChat(id);
          setNewMessageOpen(false);
        }}
        onLoadAvatar={loadChatAvatar}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onUpdate={update}
        onOpenDownloadFolder={openDownloadFolder}
      />

      {toastMessage ? <Toast message={toastMessage} /> : null}
    </TooltipProvider>
  );
}
