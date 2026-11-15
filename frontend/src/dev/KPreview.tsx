import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import "@radix-ui/themes/styles.css";
import "../ui/f.css";
import "../i18n";
import i18n from "../i18n";
import { AppTheme } from "../ui/theme";
import { chatColor, chatInitials, peerAvatarBackground } from "../data/telegram";
import type { Chat, ChatFolder } from "../types";
import { KChatList } from "../components/k/KChatList";
import { KEmptyChatSurface, KTipsToggle } from "../components/k/KEmptyChat";
import { KMainScreen } from "../components/k/KMainScreen";
import { KSettings } from "../components/k/KSettings";
import { KStickersPage } from "../components/k/KStickersPage";
import { KNewChatFlow, type KNewChatMember } from "../components/k/KNewChatFlow";
import type { KSuperTabEntry } from "../components/k/KSuperTab";
import { setTipsHidden, setTipsIndex } from "../components/k/tipsStore";
import { createStickersPageFixture } from "./kStickersFixture";
import "../app.css";
import "../components/layout/layout.css";
import "../components/layout/shell-f.css";
import "../components/chat/chat.css";
import "../styles/k/k.css";

const params = new URLSearchParams(window.location.search);
const showChat = params.get("chat") === "1";
const page = params.get("page");
const openMenu = params.get("menu") === "1";
const showTips = params.get("tips") === "1";
const darkPreview = params.get("night") === "1";
const stickersFixture = createStickersPageFixture();

void i18n.changeLanguage(params.get("lang") ?? "zh");
document.documentElement.dataset.loggedIn = "true";
// The dark-shell signal the F-side CSS (and the Radix-portalled K menus, which
// live outside .k-root) key their Night colours off, exactly like the real app's
// useTheme hook sets it.
document.documentElement.dataset.theme = darkPreview ? "dark" : "light";
document.documentElement.style.colorScheme = darkPreview ? "dark" : "light";

const noop = () => undefined;

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

const people: KNewChatMember[] = [
  { id: 9001, name: "周康哲", username: "zhoukangzhe" },
  { id: 780, name: "Nova", username: "nova_dev" },
  { id: 4242, name: "Telegram", username: "telegram" },
  { id: 787, name: "TDrive", username: "tdrive_bot" },
  { id: 1001, name: "设计素材分享", username: "design_materials" },
  { id: 1002, name: "极搜中文搜索", username: "jiso_search" },
];

const toast = (message: string) => console.log("toast:", message);

// Force the tips deck open on the Appearance card for CDP captures.
if (showTips) {
  setTipsHidden(false);
  setTipsIndex(0);
}

function Preview() {
  const [query, setQuery] = useState("");
  const [sidebarPage, setSidebarPage] = useState<
    "settings" | "stickers" | "channel" | "group" | null
  >(
    page === "settings"
      ? "settings"
      : page === "stickers"
        ? "stickers"
        : page === "channel"
          ? "channel"
          : page === "group"
            ? "group"
            : null,
  );

  // Auto-open the hamburger menu for CDP screen captures. Radix opens the menu
  // on pointerdown, so a plain `.click()` is not enough.
  useEffect(() => {
    if (!openMenu) return;
    const timer = window.setTimeout(() => {
      const burger = document.querySelector<HTMLButtonElement>(
        ".left-sidebar-burger",
      );
      if (!burger) return;
      burger.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
      burger.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
      burger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);

  const accountName = "Geraldine";
  const accountInitials = "G";
  const avatarBackground = peerAvatarBackground(4242);
  const nightMode = darkPreview;
  const animationLevel = 2;

  const superTabStack: KSuperTabEntry[] = [];
  if (sidebarPage === "settings") {
    superTabStack.push({
      key: "settings",
      body: (
        <KSettings
          name={accountName}
          initials={accountInitials}
          avatarBackground={avatarBackground}
          phone="+886 905 462 282"
          username="geraldine"
          languageLabel="简体中文"
          deviceCount={32}
          backLabel="Back"
          onBack={() => setSidebarPage(null)}
          onOpenLegacySettings={noop}
          onLogOut={noop}
          onOpenQrCode={noop}
          onToast={toast}
          onOpenUrl={noop}
        />
      ),
    });
  } else if (sidebarPage === "stickers") {
    superTabStack.push({
      key: "stickers",
      body: (
        <KStickersPage
          backLabel="Back"
          onBack={() => setSidebarPage(null)}
          onToast={toast}
          preview={stickersFixture}
        />
      ),
    });
  } else if (sidebarPage === "channel" || sidebarPage === "group") {
    superTabStack.push({
      key: `new-${sidebarPage}`,
      body: (
        <KNewChatFlow
          kind={sidebarPage === "channel" ? "channel" : "group"}
          onBack={() => setSidebarPage(null)}
          onCreated={() => setSidebarPage(null)}
          onCreateChannel={async () => "channel:1:1"}
          onCreateGroup={async () => "chat:1"}
          onSearchUsers={async (value) =>
            people.filter(
              (person) =>
                !value ||
                person.name.toLowerCase().includes(value.toLowerCase()) ||
                (person.username ?? "").toLowerCase().includes(value.toLowerCase()),
            )
          }
          onToast={toast}
        />
      ),
    });
  }

  const center = showChat ? (
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
      themePreference={darkPreview ? "dark" : "light"}
      onThemePreferenceChange={noop}
      resolvedNight={darkPreview}
    />
  );

  return (
    <AppTheme appearance={darkPreview ? "dark" : "light"}>
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
            onToast={toast}
            onChats={noop}
            onDownloads={noop}
            onSettings={() => setSidebarPage("settings")}
            onNewChannel={() => setSidebarPage("channel")}
            onNewGroup={() => setSidebarPage("group")}
            superTabStack={superTabStack}
            nightMode={nightMode}
            onToggleNightMode={noop}
            animationLevel={animationLevel}
            onCycleAnimations={noop}
            onMoreAction={noop}
            accountAvatarBackground={avatarBackground}
            onLogout={noop}
            activeDownloads={0}
            accountName={accountName}
            accountInitials={accountInitials}
            accountColor="#8774e1"
            loading={false}
            failed={false}
          />
        }
        center={center}
        overlay={showChat || sidebarPage ? null : <KTipsToggle />}
        chatOpen={showChat}
        animationLevel={animationLevel}
        theme={darkPreview ? "dark" : "light"}
      />
    </AppTheme>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Preview />);
