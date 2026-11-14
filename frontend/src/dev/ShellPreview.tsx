import ReactDOM from "react-dom/client";
import { useState } from "react";
import "@radix-ui/themes/styles.css";
import "../ui/f.css";
import "../app.css";
import "../components/layout/layout.css";
import "../components/layout/titlebar.css";
import "../components/chat/chat.css";
import "../components/layout/shell-f.css";
import "../components/downloads/downloads-f.css";
import "../components/settings/settings-f.css";
import "../i18n";
import i18n from "../i18n";
import { chatColor, chatInitials } from "../data/telegram";
import type { Chat, ChatMember, DownloadTask, Message } from "../types";
import { defaultSettings, type AppSettings } from "../hooks/useSettings";
import { AppTheme } from "../ui/theme";
import { EmptyState, Toast } from "../ui";
import { TitleBar } from "../components/layout/TitleBar";
import { Sidebar } from "../components/layout/Sidebar";
import { ChatView } from "../components/chat/ChatView";
import { DownloadsView } from "../components/downloads/DownloadsView";
import { SettingsDialog } from "../components/settings/SettingsDialog";

const params = new URLSearchParams(window.location.search);
const theme: "light" | "dark" = params.get("theme") === "dark" ? "dark" : "light";
const state = params.get("state") ?? "chat";
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;
void i18n.changeLanguage("zh");

if (state === "typing") {
  localStorage.setItem("tgdesk.draft.team", "明早我把图标接进主包");
} else {
  localStorage.removeItem("tgdesk.draft.team");
}

const noop = () => undefined;

const previewMembers: ChatMember[] = [
  { id: "member-mia", name: "Mia", username: "mia", admin: true },
  { id: "member-leo", name: "Leo", username: "leo" },
  { id: "member-alex", name: "Alex Chen", username: "alexchen" },
  { id: "member-lin", name: "林小满", username: "linxiaoman" },
  { id: "member-bot", name: "设计助手", bot: true },
];

function chat(partial: Partial<Chat> & Pick<Chat, "id" | "title" | "kind">): Chat {
  return {
    preview: "",
    time: "",
    color: chatColor(partial.id),
    initials: chatInitials(partial.title),
    ...partial,
  };
}

const chats: Chat[] = [
  chat({
    id: "team",
    username: "design_team",
    title: "设计团队",
    kind: "group",
    preview: "Mia：新版图标已经上传",
    time: "22:19",
    unread: 2,
    pinned: true,
    verified: true,
    members: "18 位成员 · 3 人在线",
  }),
  chat({
    id: "alex",
    title: "Alex Chen",
    kind: "private",
    preview: "Sounds good, ship it.",
    time: "22:17",
    online: true,
  }),
  chat({
    id: "product",
    title: "产品讨论",
    kind: "group",
    preview: "明天下午评审，记得带原型",
    time: "22:13",
    unread: 1,
    members: "12 位成员",
  }),
  chat({
    id: "files",
    title: "文件传输",
    kind: "private",
    preview: "design-spec.pdf",
    time: "22:07",
  }),
  chat({
    id: "updates",
    title: "产品更新频道",
    kind: "channel",
    preview: "本周发布说明",
    time: "22:00",
    verified: true,
    muted: true,
    members: "2.4K 订阅者",
  }),
  chat({
    id: "lin",
    title: "林小满",
    kind: "private",
    preview: "收到，谢谢！",
    time: "21:48",
    online: true,
  }),
  chat({
    id: "hiking",
    title: "周末爬山小组",
    kind: "group",
    preview: "照片先发群里啦",
    time: "21:30",
    unread: 12,
    muted: true,
    members: "9 位成员",
  }),
  chat({
    id: "archive-old",
    title: "旧项目归档",
    kind: "group",
    preview: "TgtoDrive 交流互助群，SupayC…",
    time: "周一",
    archived: true,
    unread: 11,
    members: "11 位成员",
  }),
  chat({
    id: "archive-assets",
    title: "设计素材库",
    kind: "channel",
    preview: "本周新增 24 个图标",
    time: "周日",
    archived: true,
    members: "2.4K 订阅者",
  }),
];

function previewPhotoDataUrl(
  title: string,
  from: string,
  to: string,
  width: number,
  height: number,
) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="18" y="18" width="${width - 36}" height="${height - 36}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="4"/><text x="50%" y="50%" fill="rgba(255,255,255,.9)" font-family="Inter, sans-serif" font-size="${Math.round(height / 8)}" text-anchor="middle" dominant-baseline="middle">${title}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const previewLandscapePhoto = previewPhotoDataUrl("Preview photo", "#1f3b73", "#0d1b33", 900, 560);
const previewPortraitPhoto = previewPhotoDataUrl("Portrait", "#5b2c6f", "#1b0a21", 620, 930);
const previewVideoPoster = previewPhotoDataUrl("Screen recording", "#2c3e50", "#0b1520", 960, 540);

const messages: Message[] = [
  {
    id: 1,
    chatId: "team",
    out: false,
    sender: "Mia",
    senderId: "mia",
    text: "新版图标已经上传，大家看一下。",
    time: "22:15",
    date: "今天",
  },
  {
    id: 2,
    chatId: "team",
    out: false,
    sender: "Mia",
    senderId: "mia",
    text: "间距和信息层级都调整过了。",
    time: "22:15",
    date: "今天",
  },
  {
    id: 3,
    chatId: "team",
    out: true,
    text: "看到了，效果不错，明早我把图标接进主包。",
    time: "22:17",
    date: "今天",
    checks: "read",
    replyToId: 2,
    replyToText: "间距和信息层级都调整过了。",
  },
  {
    id: 4,
    chatId: "team",
    out: false,
    sender: "Leo",
    senderId: "leo",
    text: "终稿在这里，麻烦大家确认一下。",
    time: "22:19",
    date: "今天",
    media: {
      kind: "file",
      name: "design-spec.pdf",
      size: "4.2 MB",
      ext: "PDF",
      color: "#d9537f",
    },
  },
  {
    id: 5,
    chatId: "team",
    out: false,
    sender: "Mia",
    senderId: "mia",
    text: "",
    time: "22:20",
    date: "今天",
    media: {
      kind: "voice",
      name: "Voice message",
      duration: 12,
      size: "128 KB",
    },
  },
  {
    id: 6,
    chatId: "team",
    out: false,
    sender: "Mia",
    senderId: "mia",
    text: "海边拍的参考图，这次改版就往这个方向靠。",
    time: "22:21",
    date: "今天",
    media: {
      kind: "photo",
      name: "reference.jpg",
      photoUrl: previewLandscapePhoto,
      thumbUrl: previewLandscapePhoto,
      width: 900,
      height: 560,
      size: "2.4 MB",
      ext: "JPG",
    },
  },
  {
    id: 7,
    chatId: "team",
    out: false,
    sender: "Leo",
    senderId: "leo",
    text: "",
    time: "22:22",
    date: "今天",
    media: {
      kind: "photo",
      name: "poster.png",
      photoUrl: previewPortraitPhoto,
      thumbUrl: previewPortraitPhoto,
      width: 620,
      height: 930,
      size: "1.1 MB",
      ext: "PNG",
    },
  },
  {
    id: 8,
    chatId: "team",
    out: false,
    sender: "Mia",
    senderId: "mia",
    text: "录屏在这里，看下动效节奏。",
    time: "22:23",
    date: "今天",
    media: {
      kind: "video",
      name: "screen-recording.mp4",
      thumbUrl: previewVideoPoster,
      width: 960,
      height: 540,
      duration: 12,
      size: "8.6 MB",
      ext: "MP4",
      mime: "video/mp4",
    },
  },
];

const activeTasks: DownloadTask[] = [
  {
    id: "task-1",
    name: "design-spec.pdf",
    chat: "设计团队",
    chatId: "team",
    messageId: 102,
    size: "4.2 MB",
    progress: 42,
    speed: "1.8 MB/s",
    eta: "2 秒",
    status: "active",
    ext: "pdf",
    color: "#d9537f",
  },
  {
    id: "task-2",
    name: "icon-set-v2.zip",
    chat: "文件传输",
    chatId: "team",
    messageId: 103,
    size: "128 MB",
    progress: 0,
    status: "queued",
    ext: "zip",
    color: "#f59e0b",
  },
  {
    id: "task-3",
    name: "产品演示.mp4",
    chat: "产品讨论",
    chatId: "team",
    messageId: 104,
    size: "86 MB",
    progress: 80,
    status: "paused",
    ext: "mp4",
    color: "#3e63dd",
  },
];

const completedTasks: DownloadTask[] = [
  {
    id: "task-4",
    name: "brand-guidelines.pdf",
    chat: "设计团队",
    chatId: "team",
    messageId: 101,
    size: "12 MB",
    progress: 100,
    status: "done",
    ext: "pdf",
    color: "#10b981",
  },
  {
    id: "task-5",
    name: "icon-preview.png",
    chat: "文件传输",
    chatId: "team",
    messageId: 4,
    size: "2.4 MB",
    progress: 100,
    status: "done",
    ext: "png",
    color: "#8b5cf6",
  },
];

const failedTasks: DownloadTask[] = [
  {
    id: "task-6",
    name: "voice-note.ogg",
    chat: "林小满",
    chatId: "team",
    messageId: 5,
    size: "3.1 MB",
    progress: 38,
    status: "failed",
    ext: "ogg",
    color: "#d64040",
    error: "连接超时，请重试",
  },
];

const previewThumb =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6b8bff"/><stop offset="1" stop-color="#b2d8ff"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="400" cy="300" r="120" fill="rgba(255,255,255,.35)"/></svg>',
  );

function previewSharedMedia(section: string, chatID: string): Message[] {
  const base = { chatId: chatID, out: false, text: "", time: "22:20", date: "今天" };
  const photo: Message = {
    ...base,
    id: 101,
    media: { kind: "photo", name: "Photo", thumbUrl: previewThumb, width: 800, height: 600 },
  };
  const video: Message = {
    ...base,
    id: 102,
    media: {
      kind: "video",
      name: "Video",
      thumbUrl: previewThumb,
      duration: 42,
      width: 1280,
      height: 720,
    },
  };
  const gif: Message = {
    ...base,
    id: 103,
    media: { kind: "animation", name: "GIF", thumbUrl: previewThumb },
  };
  const file: Message = {
    ...base,
    id: 4,
    media: {
      kind: "file",
      name: "design-spec.pdf",
      size: "4.2 MB",
      ext: "PDF",
      color: "#d9537f",
    },
  };
  const music: Message = {
    ...base,
    id: 104,
    media: {
      kind: "audio",
      name: "Night Drive",
      title: "Night Drive",
      performer: "Mia",
      duration: 183,
      color: "#7bc862",
    },
  };
  const voice: Message = {
    ...base,
    id: 5,
    media: { kind: "voice", name: "Voice message", duration: 12, size: "128 KB" },
  };
  switch (section) {
    case "media":
      return [photo, video];
    case "files":
      return [file];
    case "gifs":
      return [gif];
    case "music":
      return [music];
    case "voice":
      return [voice];
    default:
      return [];
  }
}

function SettingsDemo() {
  const [settings, setSettings] = useState<AppSettings>({
    ...defaultSettings,
    language: "zh",
    theme,
    downloadDir: "D:\\tgdesk\\downloads",
    threads: 6,
    proxyType: "socks5",
    proxyHost: "127.0.0.1",
    proxyPort: "1080",
  });
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };
  return (
    <SettingsDialog
      open
      onOpenChange={noop}
      settings={settings}
      onUpdate={update}
      onOpenDownloadFolder={noop}
      onChooseDownloadFolder={noop}
    />
  );
}

function Shell() {
  const [demoChats, setDemoChats] = useState(chats);
  const demoChat = demoChats[0];
  const togglePin = (id: string) =>
    setDemoChats((current) =>
      current.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item)),
    );
  const toggleMute = (id: string) =>
    setDemoChats((current) =>
      current.map((item) => (item.id === id ? { ...item, muted: !item.muted } : item)),
    );
  const markRead = (id: string) =>
    setDemoChats((current) =>
      current.map((item) => (item.id === id ? { ...item, unread: 0 } : item)),
    );
  const markAllRead = () =>
    setDemoChats((current) =>
      current.map((item) => (item.archived ? { ...item, unread: 0 } : item)),
    );

  return (
    <div className="f-shell">
      <Sidebar
        activeView={state === "downloads" ? "downloads" : "chats"}
        chats={demoChats}
        selectedChatId={demoChat.id}
        query=""
        onQueryChange={noop}
        onSelectChat={noop}
        onTogglePin={togglePin}
        onToggleMute={toggleMute}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onDownloadAll={noop}
        onToggleArchive={noop}
        onToast={noop}
        onChats={noop}
        onDownloads={noop}
        onSettings={noop}
        onLogout={noop}
        activeDownloads={2}
        folders={[]}
        archivedCount={demoChats.filter((item) => item.archived).length}
        accountRestricted={false}
        accountName="周康哲"
        accountInitials="周"
        accountColor="#8774e1"
        loading={false}
        failed={false}
      />
      {state === "downloads" ? (
        <div className="f-downloads-pane">
          <DownloadsView
            active={activeTasks}
            completed={completedTasks}
            failed={failedTasks}
            onPause={noop}
            onResume={noop}
            onRetry={noop}
            onRemove={noop}
            onPauseAll={noop}
            onResumeAll={noop}
            onClearCompleted={noop}
            onClearFailed={noop}
            onOpenDownloadFolder={noop}
          />
        </div>
      ) : state === "empty" ? (
        <main className="f-chat-pane f-chat-empty">
          <EmptyState
            icon="forum"
            title="还没有选择会话"
            description="从左侧挑一个会话，或者新建一条消息。"
          />
        </main>
      ) : (
        <ChatView
          chat={demoChat}
          chats={demoChats}
          messages={messages}
          downloads={[...activeTasks, ...completedTasks, ...failedTasks]}
          onDownloadMessage={noop}
          onDownloadInline={noop}
          onOpenDownloaded={noop}
          onPauseDownload={noop}
          onResumeDownload={noop}
          onOpenMediaViewer={() => Promise.resolve()}
          onLoadChatInfo={() =>
            Promise.resolve({
              members: previewMembers.length,
              canViewMembers: true,
              countsKnown: true,
              counts: [
                { section: "media" as const, count: 8 },
                { section: "files" as const, count: 2 },
                { section: "links" as const, count: 3 },
                { section: "music" as const, count: 1 },
                { section: "voice" as const, count: 2 },
                { section: "gifs" as const, count: 1 },
              ],
            })
          }
          onLoadMembersPage={(_id, offset) =>
            Promise.resolve({
              members: previewMembers.slice(offset, offset + 50),
              nextOffset: 0,
              total: previewMembers.length,
            })
          }
          onLoadSharedMedia={(chatID, section) =>
            Promise.resolve({
              items: previewSharedMedia(section, chatID),
              hasMore: false,
              nextBeforeId: 0,
            })
          }
          onDownloadAll={noop}
          onLoadChatProfile={() =>
            Promise.resolve({
              type: "group",
              members: previewMembers.length,
              canViewMembers: true,
              canSend: true,
              canSendPlain: true,
            })
          }
          onArchiveChat={noop}
          onSendBotCallback={() => Promise.resolve(null)}
          onOpenBotWebView={noop}
          onSendCommand={() => Promise.resolve()}
          onTogglePin={togglePin}
          onToggleMute={toggleMute}
          onMarkRead={markRead}
          onSendMessage={() => Promise.resolve()}
          onEditMessage={() => Promise.resolve()}
          onDeleteMessage={() => Promise.resolve()}
          onForwardMessage={() => Promise.resolve()}
          onReactMessage={() => Promise.resolve()}
          onAttach={() => Promise.resolve(false)}
          onToast={noop}
          enterToSend
          loading={false}
          failed={false}
          hasMoreMessages
          olderMessagesLoading={false}
          onLoadOlder={noop}
          selfName="周康哲"
          selfInitials="周"
          selfColor="#8774e1"
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div className="g-window">
    <TitleBar />
    <div className="g-window-body">
      <AppTheme appearance={theme}>
        <div className="g-app-shell">
          <Shell />
        </div>
        {state === "settings" ? <SettingsDemo /> : null}
        {state === "toast" ? <Toast message="链接已复制到剪贴板" /> : null}
      </AppTheme>
    </div>
  </div>,
);


