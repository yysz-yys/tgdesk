import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Events } from "@wailsio/runtime";
import { IconLoader2 } from "@tabler/icons-react";
import { Service as AppService } from "../bindings/tgdesk/internal/app";
import { resolveLanguage } from "./i18n";

import {
  mapChat,
  mapMessage,
  type KernelChat,
  type KernelMessage,
} from "./data/telegram";
import type { DownloadTaskDTO } from "../bindings/tgdesk/internal/kernel/models";
import type { AuthUser, Chat, DownloadEvent, DownloadTask, TaskStatus } from "./types";
import { useTheme } from "./hooks/useTheme";
import { useSettings, type AppSettings } from "./hooks/useSettings";
import { TooltipProvider } from "./components/ui/Tooltip";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatView } from "./components/chat/ChatView";
import { DownloadsView } from "./components/downloads/DownloadsView";
import { RightPanel } from "./components/layout/RightPanel";
import { AboutDialog } from "./components/layout/AboutDialog";
import { LoginScreen } from "./components/auth/LoginScreen";
import { SettingsDialog } from "./components/settings/SettingsDialog";

type KernelStatus = {
  appVersion: string;
  tdlVersion: string;
  tdlCoreVersion: string;
};

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
  const { preference, resolvedTheme, setPreference, toggleTheme } = useTheme();
  const { settings, update, reset } = useSettings();
  const [authChecked, setAuthChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authImportError, setAuthImportError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatDTOs, setChatDTOs] = useState<KernelChat[]>([]);
  const [messageDTOs, setMessageDTOs] = useState<KernelMessage[]>([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [chatsLoading, setChatsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatsFailed, setChatsFailed] = useState(false);
  const [messagesFailed, setMessagesFailed] = useState(false);
  const [portableRoot, setPortableRoot] = useState("");
  const [portableDownloads, setPortableDownloads] = useState("");
  const [view, setView] = useState<"chats" | "downloads">("chats");
  const [query, setQuery] = useState("");
  const [rightOpen, setRightOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [status, setStatus] = useState<KernelStatus | null>(null);
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
    let alive = true;
    AppService.GetStatus()
      .then((next) => {
        if (alive && next) {
          setStatus({
            appVersion: next.appVersion,
            tdlVersion: next.tdlVersion,
            tdlCoreVersion: next.tdlCoreVersion,
          });
        }
      })
      .catch(() => {
        // The UI must stay usable when the kernel is still booting.
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedChatId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (rightOpen) {
        setRightOpen(false);
      } else if (selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rightOpen, selectedIds]);

  useEffect(() => {
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--tg-message-size", `${settings.messageSize}px`);
  }, [settings.messageSize]);

  useEffect(() => {
    document.documentElement.dataset.pattern = settings.chatPattern ? "on" : "off";
  }, [settings.chatPattern]);

  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent;
  }, [settings.accent]);

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
      setSelectedChatId(filteredChats[0].id);
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
    AppService.GetChats(proxyUrl, settings.ntp, 100)
      .then((list) => {
        if (!alive) {
          return;
        }
        const next = list ?? [];
        setChatDTOs(next);
        setSelectedChatId((current) =>
          next.some((chat) => chat.id === current) ? current : (next[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (!alive) {
          return;
        }
        setChatDTOs([]);
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
    setMessageDTOs([]);
    AppService.GetMessages(selectedChatId, proxyUrl, settings.ntp, 50)
      .then((list) => {
        if (alive) {
          setMessageDTOs(list ?? []);
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
    setRightOpen(false);
  };

  const openDownloads = () => {
    setView("downloads");
    setRightOpen(false);
    setSelectedIds(new Set());
  };

  const togglePin = (id: string) => {
    setChatDTOs((current) =>
      current.map((chat) => (chat.id === id ? { ...chat, pinned: !chat.pinned } : chat)),
    );
    showToast(t("toasts.pinUpdated"));
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
        setRightOpen(false);
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
        <div className="login-screen">
          <div className="login-card app-loading">
            <span className="login-logo">tg</span>
            <IconLoader2 className="login-spin" size={22} />
            <p>{t("login.checkingSession")}</p>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  if (!loggedIn) {
    return (
      <TooltipProvider delayDuration={350}>
        <LoginScreen
          theme={resolvedTheme}
          onToggleTheme={toggleTheme}
          onAuthenticated={handleAuthenticated}
          tdlVersion={status?.tdlVersion}
          proxy={proxyUrl}
          ntp={settings.ntp}
          importError={authImportError}
          settings={settings}
          onUpdate={update}
        />
      </TooltipProvider>
    );
  }

  const activeCount = active.filter(
    (task) => task.status === "active" || task.status === "queued",
  ).length;
  const activeSpeed =
    active.find((task) => task.status === "active" && task.speed)?.speed ?? "0 B/s";

  return (
    <TooltipProvider delayDuration={350}>
      <div className="app-shell">
        <Sidebar
          chats={filteredChats}
          selectedChatId={selectedChatId}
          view={view}
          query={query}
          onQueryChange={setQuery}
          onSelectChat={openChat}
          onSelectDownloads={openDownloads}
          onTogglePin={togglePin}
          onToggleMute={toggleMute}
          onMarkRead={markRead}
          onDownloadAll={downloadAll}
          theme={resolvedTheme}
          onToggleTheme={toggleTheme}
          onSettings={() => setSettingsOpen(true)}
          onLogout={handleLogout}
          onAbout={() => setAboutOpen(true)}
          onToast={showToast}
          activeDownloads={activeCount}
          activeSpeed={activeSpeed}
          tdlVersion={status?.tdlVersion ?? "v0.20.4"}
          accountName={authUser?.displayName ?? t("settings.general.telegramAccount")}
          accountInitials={authUser?.initials ?? "T"}
          accountColor={authUser?.color ?? "#65aadd"}
          loading={chatsLoading}
          failed={chatsFailed}
        />

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
            onToast={showToast}
          />
        ) : selectedChat ? (
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
            onClearSelection={() => setSelectedIds(new Set())}
            onSelectAll={selectAll}
            onDownloadSelected={downloadSelected}
            onDownloadAll={() => downloadAll(selectedChat)}
            onOpenInfo={() => setRightOpen((open) => !open)}
            onToast={showToast}
            rightOpen={rightOpen}
            loading={messagesLoading}
            failed={messagesFailed}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-title">
              {chatsLoading
                ? t("chat.loadingChats")
                : chatsFailed
                  ? t("chat.loadChatsFailed")
                  : t("chat.noChats")}
            </div>
            {!chatsLoading && !chatsFailed && (
              <div className="empty-copy">{t("chat.noChatsDesc")}</div>
            )}
          </div>
        )}

        {rightOpen && selectedChat && view === "chats" && (
          <RightPanel
            chat={selectedChat}
            onClose={() => setRightOpen(false)}
            onDownloadAll={() => downloadAll(selectedChat)}
            onToast={showToast}
          />
        )}
      </div>

      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        appVersion={status?.appVersion ?? "0.1.0"}
        tdlVersion={status?.tdlVersion ?? "v0.20.4"}
        tdlCoreVersion={status?.tdlCoreVersion ?? "v0.20.4"}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onUpdate={update}
        onReset={reset}
        themePreference={preference}
        onThemePreferenceChange={setPreference}
        onLogout={handleLogout}
        onToast={showToast}
        status={status}
        user={authUser}
      />

      {toastMessage && <div className="toast">{toastMessage}</div>}
    </TooltipProvider>
  );
}
