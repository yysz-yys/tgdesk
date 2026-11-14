import ReactDOM from "react-dom/client";
import { useState } from "react";
import "@radix-ui/themes/styles.css";
import "../ui/f.css";
import "../i18n";
import i18n from "../i18n";
import { AppTheme } from "../ui/theme";
import { chatColor, chatInitials } from "../data/telegram";
import type { Chat, ChatFolder } from "../types";
import { KChatList } from "../components/k/KChatList";
import { KEmptyChatSurface, KTipsToggle } from "../components/k/KEmptyChat";
import { KMainScreen } from "../components/k/KMainScreen";
import "../app.css";
import "../components/layout/layout.css";
import "../components/layout/shell-f.css";
import "../components/chat/chat.css";
import "../styles/k/k.css";

void i18n.changeLanguage("zh");
document.documentElement.dataset.loggedIn = "true";

const noop = () => undefined;
const showChat =
  new URLSearchParams(window.location.search).get("chat") === "1";

function chat(partial: Partial<Chat> & Pick<Chat, "id" | "title" | "kind">): Chat {
  return {
    preview: "",
    time: "",
    color: chatColor(partial.id),
    initials: chatInitials(partial.title),
    ...partial,
  };
}

/** Fixtures mirroring the reference capture's rows (avatars fall back to initials). */
const chats: Chat[] = [
  chat({
    id: "user:9001:1",
    title: "我的收藏",
    kind: "private",
    preview: "111",
    time: "15:21",
    saved: true,
  }),
  chat({
    id: "channel:1001:1",
    title: "设计素材分享-百科全书📚",
    kind: "channel",
    preview: "#优质频道推荐 💻 破解类 ◉ 29…",
    time: "11:55",
    members: "29 位订阅者",
  }),
  chat({
    id: "channel:1002:1",
    title: "极搜🔍中文搜索@JISO",
    kind: "channel",
    preview: "🧭 发现",
    time: "11:13",
    lastOut: true,
    lastChecks: "read",
    members: "1.2K 订阅者",
  }),
  chat({
    id: "user:780:1",
    title: "n8n_test",
    kind: "private",
    preview: "archive-sync-1794556850",
    time: "周五",
  }),
  chat({
    id: "user:4242:1",
    title: "Telegram",
    kind: "private",
    preview: "Login code: 123456. Do not give t…",
    time: "周四",
    verified: true,
  }),
  chat({
    id: "user:787:1",
    title: "TDrive",
    kind: "private",
    preview: "TDX1|t=rmdir|obj=d:9a1d035c-872…",
    time: "7月16日",
    lastOut: true,
    lastChecks: "sent",
  }),
  chat({
    id: "group:780:1",
    title: "test-频道",
    kind: "group",
    preview: "此频道中的消息将在 1 天后自动删…",
    time: "7月8日",
    lastOut: true,
    lastChecks: "sent",
    ttl: 86_400,
  }),
  chat({
    id: "group:787:1",
    title: "test-群组",
    kind: "group",
    preview: "您已设置消息在 1 天后自动删除",
    time: "7月8日",
    ttl: 86_400,
  }),
  chat({
    id: "archived-old-1",
    title: "云端官方群组",
    kind: "group",
    preview: "免费vpn | 宝…",
    time: "周三",
    archived: true,
    unread: 7,
    muted: true,
    members: "7 位成员",
  }),
  chat({
    id: "archived-old-2",
    title: "工具收藏 | 面板交流",
    kind: "group",
    preview: "公告",
    time: "周三",
    archived: true,
    muted: true,
    members: "7 位成员",
  }),
];

const folders: ChatFolder[] = [
  { id: 1, title: "123文件夹", chatKeys: [], excludeKeys: [], groups: true },
  { id: 2, title: "222", chatKeys: [], excludeKeys: [], broadcasts: true },
  { id: 3, title: "222", chatKeys: [], excludeKeys: [], contacts: true },
  { id: 4, title: "22222", chatKeys: [], excludeKeys: [], bots: true },
];

function Preview() {
  const [query, setQuery] = useState("");
  return (
    <AppTheme appearance="light">
      <KMainScreen
        sidebar={
          <KChatList
            activeView="chats"
            chats={chats}
            folders={folders}
            selectedChatId=""
            query={query}
            onQueryChange={setQuery}
            onSelectChat={noop}
            onTogglePin={noop}
            onToggleMute={noop}
            onMarkRead={noop}
            onMarkAllRead={noop}
            onDownloadAll={noop}
            onToggleArchive={noop}
            onToast={noop}
            onChats={noop}
            onDownloads={noop}
            onSettings={noop}
            onLogout={noop}
            activeDownloads={0}
            accountName="周康哲"
            accountInitials="周"
            accountColor="#8774e1"
            loading={false}
            failed={false}
          />
        }
        center={
          showChat ? (
            <div className="f-shell k-center-host">
              <div className="g-chat-pane">
                <div style={{ padding: 24, fontFamily: "Roboto, sans-serif" }}>
                  Chat pane placeholder (layout check for the open-chat state)
                </div>
              </div>
            </div>
          ) : (
            <KEmptyChatSurface
              chats={chats}
              onSelectChat={noop}
              onSettings={noop}
            />
          )
        }
        overlay={showChat ? null : <KTipsToggle />}
        chatOpen={showChat}
      />
    </AppTheme>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Preview />);
