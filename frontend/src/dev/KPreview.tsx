/**
 * Dev-only Web K page preview harness (never imported by production code).
 *
 *   cd frontend && npx vite --port 9250 --strictPort
 *   http://127.0.0.1:9250/k-preview.html?page=chat&peer=group&night=1&lang=zh
 *
 * Chat page (full Web K shell: KMainScreen + KChatList + a fixture ChatView):
 *   ?page=chat&peer=channel|admin|group|private|bot|saved
 *   &night=1            dark shell
 *   &lang=zh|en|ja      UI language (default zh)
 *   &pinned=0           hide the pinned-message strip (shown by default)
 *   &pinned=1|many|media|hidden
 *                       pinned-plate scenarios: default single pin (legacy
 *                       loader), multi-pin dashed bar + #3 counter, pin with a
 *                       40px media thumb, hidden-until-newer-pin (canPin false +
 *                       seeded tgdesk.pinnedBarHidden max id)
 *   &unread=N           unread counter on ScrollDownButton (.badge-24)
 *   &scroll=up          scroll the conversation to the top (default down)
 *   &hover=file         mark a hover target (see HOVER_TARGETS) and scroll to it
 *   &panel=search|info  open the in-chat search / the chat-info panel on mount
 *   &state=…            scenario alias: loading|failed|search|info|upload|slow|
 *                       scroll-up|no-pinned|pinned|hover-file|<hover target>;
 *                       `?fixture=` is an alias for `?state=`
 *   &title=…&about=…    prefill the new-channel/group form
 *   &step=form          (group only) open the New Group name/photo page; the
 *                       group flow opens on Add Members by default (image 4)
 *
 * K pages: ?page=settings|stickers|channel|group|new-private|tips; &tip=0|1|2
 * selects the tips card (2 = third/Chats card); &tipsData=popular|searched|
 * closed|empty|loading|cap9 seeds the Chats card's three lists (default: empty
 * card); &contacts=list seeds the New Private Chat contact list (default: empty
 * = reference image 6); &sidebar=settings opens a K page over the sidebar on the
 * tips page; &anim=0|1|2 overrides the animation level (2 = full, the default);
 * &menu=1 opens the burger menu.
 *
 * Screenshot helper: `python temp/r4shot.py --url … --out … [--night]`.
 */
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import "@radix-ui/themes/styles.css";
import "../ui/f.css";
import "../i18n";
import i18n from "../i18n";
import { AppTheme } from "../ui/theme";
import { peerAvatarBackground } from "../data/telegram";
import { KChatList } from "../components/k/KChatList";
import { KEmptyChatSurface, KTipsToggle } from "../components/k/KEmptyChat";
import { KMainScreen } from "../components/k/KMainScreen";
import { KSettings } from "../components/k/KSettings";
import { KStickersPage } from "../components/k/KStickersPage";
import { KNewChatFlow } from "../components/k/KNewChatFlow";
import { KNewPrivateChat } from "../components/k/KNewPrivateChat";
import type { KNewPrivateContact } from "../components/k/KNewPrivateChat";
import type { KSuperTabEntry } from "../components/k/KSuperTab";
import { setTipsHidden, setTipsIndex, TIPS_COUNT } from "../components/k/tipsStore";
import { seedRecentPeers } from "../components/k/recentPeersStore";
import type { Chat } from "../types";
import { ChatView } from "../components/chat/ChatView";
import { createStickersPageFixture } from "./kStickersFixture";
import {
  chatPageFixture,
  previewChats,
  previewFolders,
  previewPeople,
  previewRecentSearch,
  previewRecentlyClosed,
  previewSelf,
  previewTipChats,
  previewTopPeers,
  previewTopPeersOverflow,
  previewUpload,
  slowModeProfile,
  type ChatPeerVariant,
} from "./kChatFixtures";
import "../app.css";
import "../components/layout/layout.css";
import "../components/layout/shell-f.css";
import "../components/chat/chat.css";
import "../styles/k/k.css";

const params = new URLSearchParams(window.location.search);
const legacyChat = params.get("chat") === "1";
const legacyTips = params.get("tips") === "1";
const page =
  params.get("page") ?? (legacyChat ? "chat" : legacyTips ? "tips" : null);
const pageChat = page === "chat" || legacyChat;
const pageTips = page === "tips" || legacyTips;
const openMenu = params.get("menu") === "1";
const darkPreview = params.get("night") === "1" || params.get("theme") === "dark";
const stickersFixture = createStickersPageFixture();

const PEER_VARIANTS: ChatPeerVariant[] = [
  "channel",
  "admin",
  "group",
  "private",
  "bot",
  "saved",
  // Round-4 composer capability branches (spec-composer §3/§6).
  "group-restricted",
  "group-join",
  "group-request",
  "group-anon",
  "channel-left",
  "channel-monoforum",
  "bot-blocked",
  "bot-history",
  "bot-commands",
];
const peerParam = params.get("peer");
const initialPeer: ChatPeerVariant =
  peerParam && (PEER_VARIANTS as string[]).includes(peerParam)
    ? (peerParam as ChatPeerVariant)
    : "group";

/** The chat-list rows that map onto a peer variant (row click swaps the peer). */
const PEER_BY_CHAT_ID: Record<string, ChatPeerVariant> = {
  "channel:1006:1": "channel",
  "channel:1002:1": "admin",
  "group:787:1": "group",
  "user:780:1": "private",
  "user:73001:1": "bot",
  "user:9001:1": "saved",
};

/**
 * The New Private Chat page's fixture contacts (the kernel's
 * `contacts.GetContacts` rows, `user:<id>:<accessHash>` peer ids). The
 * reference image 6 is the **empty** state — the captured account has no saved
 * contacts — so the list only appears with `&contacts=list`, which is also the
 * state for the row/sort checks.
 */
const previewContacts: KNewPrivateContact[] = previewPeople
  .slice(0, 5)
  .map((person, index) => ({
    ...person,
    peerId: `user:${person.id}:1`,
    online: index === 0,
    lastSeen: index === 1 ? 1700000000 : 0,
    status: index === 0 ? "online" : "offline",
  }));

/** Scenario deep links (`?state=` / `?fixture=`). */
type Panel = "search" | "info" | null;
const rawState = (params.get("state") ?? params.get("fixture") ?? "").toLowerCase();

let scroll: "up" | "down" = params.get("scroll") === "up" ? "up" : "down";
/** Pinned-plate scenarios (`temp/research4/harness-notes.md`). */
type PinnedMode = "default" | "none" | "many" | "media" | "hidden";
const pinnedParam = params.get("pinned");
let pinned: PinnedMode =
  pinnedParam === "0"
    ? "none"
    : pinnedParam === "many" || pinnedParam === "media" || pinnedParam === "hidden"
      ? (pinnedParam as PinnedMode)
      : "default";
const unreadParam = Number(params.get("unread") ?? "0");
const unread = Number.isFinite(unreadParam) ? Math.max(0, Math.trunc(unreadParam)) : 0;
let hover = (params.get("hover") ?? "").toLowerCase();
let panel: Panel =
  params.get("panel") === "search"
    ? "search"
    : params.get("panel") === "info"
      ? "info"
      : null;
let loading = false;
let failed = false;
let upload = false;
let slow = false;
switch (rawState) {
  case "":
    break;
  case "scroll-up":
  case "scrollup":
  case "up":
    scroll = "up";
    break;
  case "scroll-down":
  case "scroll-bottom":
  case "down":
    scroll = "down";
    break;
  case "pinned":
    pinned = "default";
    break;
  case "no-pinned":
  case "unpinned":
    pinned = "none";
    break;
  case "loading":
    loading = true;
    break;
  case "failed":
    failed = true;
    break;
  case "search":
    panel = "search";
    break;
  case "info":
    panel = "info";
    break;
  case "upload":
    upload = true;
    break;
  case "slow":
    slow = true;
    break;
  case "hover-file":
    hover = "file";
    break;
  default:
    // Any other value is treated as a hover-target shorthand (`?state=file`).
    if (!hover) {
      hover = rawState;
    }
}

// `?pinned=hidden`: Web K keeps the plate hidden until a newer message is
// pinned, remembered per chat in localStorage (`tgdesk.pinnedBarHidden`). Seed
// a max id for every fixture chat before the first render so the bar mounts
// hidden; any other pinned mode clears the seed again so later runs are clean.
const PINNED_HIDDEN_KEY = "tgdesk.pinnedBarHidden";
if (pageChat) {
  try {
    if (pinned === "hidden") {
      const parsed: Record<string, number> = {};
      for (const id of Object.keys(PEER_BY_CHAT_ID)) {
        parsed[id] = 2 ** 31 - 1;
      }
      window.localStorage.setItem(PINNED_HIDDEN_KEY, JSON.stringify(parsed));
    } else {
      window.localStorage.removeItem(PINNED_HIDDEN_KEY);
    }
  } catch {
    // Storage may be unavailable (private contexts); the plate still renders.
  }
}

const prefillTitle = params.get("title") ?? "";
const prefillAbout = params.get("about") ?? "";
const flowStep = params.get("step") ?? "";
const contactsMode = (params.get("contacts") ?? "").toLowerCase();
const tipParam = Number(params.get("tip") ?? "0");
const tipIndex = Number.isFinite(tipParam)
  ? Math.min(Math.max(0, Math.trunc(tipParam)), TIPS_COUNT - 1)
  : 0;
const lang = params.get("lang") ?? "zh";
const sidebarPage = pageChat || pageTips ? null : page;
// `&sidebar=settings` opens a K page over the sidebar on a non-K page URL (used
// to exercise the Chats tip's search link closing a sidebar page).
const sidebarParam = (params.get("sidebar") ?? "").toLowerCase();
const initialSidebar =
  sidebarPage ??
  (["settings", "stickers", "channel", "group", "new-private"].includes(
    sidebarParam,
  )
    ? sidebarParam
    : null);

/**
 * `?tipsData=` seeds the third tip card's data sources so every card state is
 * reproducible (the reference is `searched`, see temp/research4/spec-tips.md).
 */
type TipsDataMode =
  | "popular"
  | "searched"
  | "closed"
  | "empty"
  | "loading"
  | "cap9";

const rawTipsData = (params.get("tipsData") ?? "").toLowerCase();
const tipsDataMode: TipsDataMode | null =
  rawTipsData === "popular" ||
  rawTipsData === "searched" ||
  rawTipsData === "closed" ||
  rawTipsData === "empty" ||
  rawTipsData === "loading" ||
  rawTipsData === "cap9"
    ? (rawTipsData as TipsDataMode)
    : null;

interface TipsDataFixture {
  topPeers: Chat[];
  topPeersLoading: boolean;
}

/**
 * What a `?tipsData=` mode hands the Chats card. The Searched/Closed lists are
 * seeded into the real recent-peers store (the card subscribes to it); the
 * Popular list is passed as a prop because the harness has no kernel to fetch
 * it from. No param = a fresh account: both stored lists empty and Popular
 * empty+settled, which is the "Nothing here yet." card.
 */
function tipsFixture(mode: TipsDataMode | null): TipsDataFixture {
  switch (mode) {
    case "popular":
      return { topPeers: previewTopPeers, topPeersLoading: false };
    case "cap9":
      return { topPeers: previewTopPeersOverflow, topPeersLoading: false };
    case "loading":
      return { topPeers: [], topPeersLoading: true };
    case "searched":
    case "closed":
    case "empty":
    default:
      return { topPeers: [], topPeersLoading: false };
  }
}

function seedTipsLists(mode: TipsDataMode | null) {
  switch (mode) {
    case "popular":
    case "searched":
      seedRecentPeers({
        search: previewRecentSearch,
        closed: previewRecentlyClosed,
      });
      break;
    case "closed":
      seedRecentPeers({ search: [], closed: previewRecentlyClosed });
      break;
    case "cap9":
      seedRecentPeers({
        search: previewRecentSearch.slice(0, 3),
        closed: previewRecentlyClosed,
      });
      break;
    default:
      seedRecentPeers({ search: [], closed: [] });
  }
}

const tipsFixtureData = tipsFixture(tipsDataMode);
if (pageTips) {
  seedTipsLists(tipsDataMode);
}

/** Page names this harness can render today (see harness-notes.md §5 gaps). */
const SUPPORTED_PAGES = [
  "chat",
  "settings",
  "stickers",
  "channel",
  "group",
  "new-private",
  "tips",
];
const pageSupported =
  page === null || (SUPPORTED_PAGES as string[]).includes(page);

document.documentElement.dataset.loggedIn = "true";
// The dark-shell signal the F-side CSS (and the Radix-portalled K menus, which
// live outside .k-root) key their Night colours off, exactly like the real app's
// useTheme hook sets it.
document.documentElement.dataset.theme = darkPreview ? "dark" : "light";
document.documentElement.style.colorScheme = darkPreview ? "dark" : "light";
document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;

// Force the tips deck open on the requested card for screenshots.
if (pageTips || legacyTips) {
  setTipsHidden(false);
  setTipsIndex(tipIndex);
}

const noop = () => undefined;

/**
 * Every `?hover=` target the chat page can mark with a dashed outline and
 * scroll into view; r4shot then hovers `[data-preview-target="<name>"]` to get
 * the real `:hover` state. Names not listed here are treated as raw CSS
 * selectors (`?hover=.f-pinned-bar`).
 */
const HOVER_TARGETS: Record<string, string> = {
  file: ".g-file",
  // Prefer the idle file card: its download badge is the one that fades in on
  // hover (the first file carries an active task / progress ring).
  download: ".g-file .f-info-download[data-status='idle']",
  photo: ".g-media-photo",
  video: ".g-media-video",
  album: ".g-album",
  sticker: ".g-sticker",
  voice: ".g-voice",
  audio: ".g-audio",
  webpage: ".g-webpage",
  keyboard: ".g-bot-keyboard-button",
  reaction: ".g-reaction",
  reply: ".g-reply-quote",
  jump: ".g-jump-button",
  composer: ".tg-composer",
  send: ".tg-composer__send",
  attach: ".tg-composer__icon",
  peer: ".f-peer",
  pinnedbar: ".f-pinned-bar",
  header: ".f-chat-header",
};

function markHoverTarget(name: string): boolean {
  const selector =
    HOVER_TARGETS[name] ??
    (name.startsWith(".") || name.startsWith("[") || name.startsWith("#")
      ? name
      : "");
  if (!selector) {
    return true;
  }
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) {
    return false;
  }
  node.setAttribute("data-preview-target", name);
  if (name !== "jump") {
    const block = node.closest<HTMLElement>(".g-message-block");
    (block ?? node).scrollIntoView({ block: "center" });
  }
  return true;
}

interface ChatPreviewProps {
  peer: ChatPeerVariant;
  pinned: PinnedMode;
  unread: number;
  loading: boolean;
  failed: boolean;
  upload: boolean;
  slow: boolean;
  panel: Panel;
  scroll: "up" | "down";
  hover: string;
}

/**
 * The fixture chat page: the Web K shell's middle column exactly as App.tsx
 * mounts it (`<div class="f-shell k-center-host"><ChatView/></div>`), with all
 * kernel callbacks replaced by fixture data / no-ops.
 */
function ChatPreview({
  peer,
  pinned: pinnedMode,
  unread,
  loading: messagesLoading,
  failed: messagesFailed,
  upload: withUpload,
  slow: slowMode,
  panel: openPanel,
  scroll,
  hover,
}: ChatPreviewProps) {
  const fixture = useMemo(() => chatPageFixture(peer), [peer]);
  const profile = useMemo(
    () => (slowMode ? slowModeProfile(fixture.profile) : fixture.profile),
    [fixture, slowMode],
  );
  const showPinned = pinnedMode !== "none";
  // Multi-pin plate payload for the `?pinned=many|media|hidden` scenarios; the
  // default state keeps using the legacy single-message loader so existing
  // screenshots of the pinned strip stay unchanged.
  const pinnedInfo = useMemo(() => {
    if (pinnedMode === "many" || pinnedMode === "hidden") {
      const message = fixture.messages[0] ?? fixture.pinned;
      if (!message) {
        return null;
      }
      return {
        message,
        count: 3,
        maxId: message.id,
        canPin: pinnedMode !== "hidden",
      };
    }
    if (pinnedMode === "media") {
      const message = fixture.messages.find((item) => Boolean(item.media));
      if (!message) {
        return null;
      }
      return { message, count: 1, maxId: message.id, canPin: true };
    }
    return null;
  }, [fixture, pinnedMode]);

  // Programmatic state setup for deep links: panels/scroll/hover can only be
  // expressed through DOM APIs, so wait for the chat chrome then act on it.
  useEffect(() => {
    const intervals: number[] = [];
    const poll = (run: () => boolean, step = 120, timeout = 3500) => {
      let waited = 0;
      const id = window.setInterval(() => {
        waited += step;
        if (run() || waited >= timeout) {
          window.clearInterval(id);
        }
      }, step);
      intervals.push(id);
    };

    if (openPanel === "search") {
      poll(() => {
        const button = document.querySelector<HTMLButtonElement>(
          ".f-chat-actions button",
        );
        if (!button) return false;
        button.click();
        return true;
      });
    }
    if (openPanel === "info") {
      poll(() => {
        const peerButton = document.querySelector<HTMLButtonElement>(".f-peer");
        if (!peerButton) return false;
        peerButton.click();
        return true;
      });
    }
    if (scroll === "up") {
      poll(() => {
        const node = document.querySelector<HTMLElement>(".g-message-scroll");
        if (!node || node.scrollHeight <= node.clientHeight + 40) return false;
        node.scrollTop = 0;
        node.dispatchEvent(new Event("scroll"));
        return true;
      }, 100);
    }
    if (hover) {
      poll(() => markHoverTarget(hover), 150, 5000);
    }

    return () => intervals.forEach((id) => window.clearInterval(id));
  }, [openPanel, scroll, hover]);

  return (
    <div className="f-shell k-center-host">
      <ChatView
        chat={unread ? { ...fixture.chat, unread } : fixture.chat}
        chats={previewChats}
        messages={messagesLoading || messagesFailed ? [] : fixture.messages}
        downloads={fixture.downloads}
        onRefreshDownloads={noop}
        onDownloadMessage={noop}
        onDownloadInline={noop}
        onOpenDownloaded={noop}
        onPauseDownload={noop}
        onResumeDownload={noop}
        onOpenMediaViewer={async () => undefined}
        onLoadChatInfo={async () => fixture.info}
        onLoadMembersPage={async (_chatID, offset) => ({
          members: fixture.members.slice(offset, offset + 50),
          nextOffset: 0,
          total: fixture.members.length,
        })}
        onLoadChatProfile={async () => profile}
        onLoadSharedMedia={async () => ({
          items: fixture.messages.filter((message) => message.media),
          hasMore: false,
          nextBeforeId: 0,
        })}
        onArchiveChat={noop}
        onSendBotCallback={async () => null}
        onOpenBotWebView={noop}
        onSendCommand={async (command) => {
          // Dev-only probe: lets `--eval` assert START/JOIN fallbacks and the
          // group "/cmd@botusername" insertion without a kernel.
          (window as unknown as { __lastCommand?: string }).__lastCommand =
            command;
          console.log("[harness command]", command);
        }}
        onRequestLeaveChat={noop}
        onOpenLinkedChat={noop}
        onLoadSavedChats={async () => ({
          chats: previewChats.filter((item) => item.saved),
          count: 1,
        })}
        onOpenSavedChat={noop}
        onLoadChatGifts={async () => fixture.gifts ?? null}
        // `?pinned=many|media|hidden` drives the Web K multi-pin plate through
        // the new info loader; the default state keeps the legacy single-load.
        onLoadPinnedMessageInfo={
          showPinned && pinnedInfo ? async () => pinnedInfo : undefined
        }
        onLoadPinnedMessage={
          showPinned && pinnedMode === "default"
            ? async () => fixture.pinned
            : undefined
        }
        onUnpinAllMessages={async () => undefined}
        pinnedVersion={0}
        network={{ proxy: "", ntp: "" }}
        onSendSticker={async () => undefined}
        onSendGif={async () => undefined}
        onSendInlineGif={async () => undefined}
        jumpToMessageId={null}
        onJumpConsumed={noop}
        onLoadAround={async () => false}
        liveVersion={0}
        onDownloadAll={noop}
        onTogglePin={noop}
        onToggleMute={noop}
        onMarkRead={noop}
        onSendMessage={async () => undefined}
        onEditMessage={async () => undefined}
        onDeleteMessage={async () => undefined}
        onForwardMessage={async () => undefined}
        onReactMessage={async () => undefined}
        onToast={(message) => {
          (window as unknown as { __lastToast?: string }).__lastToast = message;
          console.log("[harness toast]", message);
        }}
        onAttach={async () => false}
        upload={withUpload ? previewUpload : undefined}
        enterToSend
        loading={messagesLoading}
        failed={messagesFailed}
        hasMoreMessages={false}
        olderMessagesLoading={false}
        onLoadOlder={noop}
        selfName={previewSelf.name}
        selfInitials={previewSelf.initials}
        selfColor={previewSelf.color}
      />
    </div>
  );
}

function Preview() {
  const [query, setQuery] = useState("");
  const [activePeer, setActivePeer] = useState<ChatPeerVariant>(initialPeer);
  const [sidebar, setSidebar] = useState<string | null>(initialSidebar);
  const [toastLine, setToastLine] = useState("");

  const accountName = previewSelf.name;
  const accountInitials = previewSelf.initials;
  const avatarBackground = peerAvatarBackground(4242);
  const nightMode = darkPreview;
  const animationLevel = Math.min(
    Math.max(Number(params.get("anim") ?? "2") || 0, 0),
    2,
  );

  const showToast = (message: string) => {
    setToastLine(message);
    console.log("[harness toast]", message);
  };

  // tweb's Chats description link: close the sidebar pages, then open its
  // search (`closeAllTabsNaturally() + initSearch().open()`; chatsCard.tsx).
  // The harness mirrors it so the link's focus target can be asserted.
  const openSearch = () => {
    setSidebar(null);
    window.setTimeout(() => {
      document
        .querySelector<HTMLInputElement>("#column-left .input-search-input")
        ?.focus();
    }, 50);
  };

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

  // New-channel / new-group deep links. The group flow now opens on the Add
  // Members page (image 4); `&step=form` clicks its corner arrow to reach the
  // New Group name/photo page (image 5). Titles/about are filled on the form
  // page first, so a `&title=…` prefill keeps the form arrow visible and the
  // title suggestion never overrides it.
  useEffect(() => {
    if ((sidebar !== "channel" && sidebar !== "group") || sidebarPage === null) {
      return;
    }
    const setNativeValue = (
      element: HTMLInputElement | HTMLTextAreaElement,
      value: string,
    ) => {
      const proto =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const timer = window.setTimeout(() => {
      if (prefillTitle) {
        const input = document.querySelector<HTMLInputElement>(
          ".k-newchat-form .k-input-field-input",
        );
        if (input) setNativeValue(input, prefillTitle);
      }
      if (prefillAbout) {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          ".k-newchat-form textarea",
        );
        if (textarea) setNativeValue(textarea, prefillAbout);
      }
      if (flowStep === "form" && sidebar === "group") {
        document
          .querySelector<HTMLButtonElement>(".k-newchat-members .k-newchat-next")
          ?.click();
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [sidebar]);

  const superTabStack: KSuperTabEntry[] = [];
  if (sidebar === "settings") {
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
          onBack={() => setSidebar(null)}
          onOpenLegacySettings={noop}
          onOpenStickers={noop}
          onLogOut={noop}
          onOpenQrCode={noop}
          onToast={showToast}
          onOpenUrl={noop}
        />
      ),
    });
  } else if (sidebar === "stickers") {
    superTabStack.push({
      key: "stickers",
      body: (
        <KStickersPage
          backLabel="Back"
          onBack={() => setSidebar(null)}
          onToast={showToast}
          preview={stickersFixture}
        />
      ),
    });
  } else if (sidebar === "channel" || sidebar === "group") {
    superTabStack.push({
      key: `new-${sidebar}`,
      body: (
        <KNewChatFlow
          kind={sidebar}
          onBack={() => setSidebar(null)}
          onCreated={() => setSidebar(null)}
          onCreateChannel={async () => "channel:1:1"}
          onCreateGroup={async () => "chat:1"}
          onSearchUsers={async (value) =>
            previewPeople.filter(
              (person) =>
                !value ||
                person.name.toLowerCase().includes(value.toLowerCase()) ||
                (person.username ?? "")
                  .toLowerCase()
                  .includes(value.toLowerCase()),
            )
          }
          onToast={showToast}
        />
      ),
    });
  } else if (sidebar === "new-private") {
    superTabStack.push({
      key: "new-private",
      body: (
        <KNewPrivateChat
          onBack={() => setSidebar(null)}
          onLoadContacts={async () =>
            contactsMode === "list" ? previewContacts : []
          }
          onSelectContact={(peerId) => {
            console.log("[harness select]", peerId);
            showToast(`contact → ${peerId}`);
          }}
          onAddContact={() => showToast("add contact: not implemented yet")}
          onToast={showToast}
        />
      ),
    });
  }

  const handleSelectChat = (id: string) => {
    // The tips card's tiles / Tip-nav route through here; the log lets the
    // screenshot/eval helper assert the click reached the app callback.
    console.log("[harness select]", id);
    const next = PEER_BY_CHAT_ID[id];
    if (next) {
      setActivePeer(next);
    }
  };

  let center: ReactNode;
  if (pageChat) {
    center = (
      <ChatPreview
        peer={activePeer}
        pinned={pinned}
        unread={unread}
        loading={loading}
        failed={failed}
        upload={upload}
        slow={slow}
        panel={panel}
        scroll={scroll}
        hover={hover}
      />
    );
  } else {
    center = (
      <KEmptyChatSurface
        chats={pageTips ? previewTipChats : previewChats}
        onSelectChat={handleSelectChat}
        onSettings={() => setSidebar("settings")}
        themePreference={darkPreview ? "dark" : "light"}
        onThemePreferenceChange={noop}
        resolvedNight={darkPreview}
        onOpenSearch={pageTips ? openSearch : undefined}
        topPeers={pageTips ? tipsFixtureData.topPeers : undefined}
        topPeersLoading={pageTips ? tipsFixtureData.topPeersLoading : undefined}
      />
    );
  }

  const selectedChatId = pageChat
    ? (Object.entries(PEER_BY_CHAT_ID).find(
        ([, variant]) => variant === activePeer,
      )?.[0] ?? "")
    : "";

  return (
    <AppTheme appearance={darkPreview ? "dark" : "light"}>
      <style>{`
        /* Dev-only hover-target marker: r4shot --hover '[data-preview-target="file"]' */
        [data-preview-target] {
          outline: 2px dashed #ff2d94 !important;
          outline-offset: 2px !important;
        }
        .k-preview-toast {
          position: fixed;
          inset-block-end: 18px;
          inset-inline-start: 50%;
          transform: translateX(-50%);
          z-index: 100000;
          max-width: 60vw;
          padding: 8px 14px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.78);
          color: #fff;
          font: 12px/1.4 Roboto, sans-serif;
          pointer-events: none;
        }
      `}</style>
      <KMainScreen
        sidebar={
          <KChatList
            activeView="chats"
            chats={previewChats}
            folders={previewFolders}
            selectedChatId={selectedChatId}
            query={query}
            onQueryChange={setQuery}
            onSelectChat={pageChat ? handleSelectChat : noop}
            onTogglePin={noop}
            onToggleMute={noop}
            onMarkRead={noop}
            onMarkAllRead={noop}
            onDownloadAll={noop}
            onToggleArchive={noop}
            onToast={showToast}
            onChats={noop}
            onDownloads={noop}
            onSettings={() => setSidebar("settings")}
            onNewChannel={() => setSidebar("channel")}
            onNewGroup={() => setSidebar("group")}
            onNewPrivate={() => setSidebar("new-private")}
            superTabStack={superTabStack}
            nightMode={nightMode}
            onToggleNightMode={noop}
            animationLevel={animationLevel}
            onCycleAnimations={noop}
            onMoreAction={noop}
            accountAvatarBackground={avatarBackground}
            onLogout={noop}
            activeDownloads={pageChat ? 1 : 0}
            accountName={accountName}
            accountInitials={accountInitials}
            accountColor={previewSelf.color}
            loading={false}
            failed={false}
          />
        }
        center={center}
        overlay={pageChat || sidebar ? null : <KTipsToggle />}
        chatOpen={pageChat}
        animationLevel={animationLevel}
        theme={darkPreview ? "dark" : "light"}
      />
      {!pageSupported ? (
        <div className="k-preview-toast">
          预览页面 “{page}” 还没有对应组件；已支持：{" "}
          {SUPPORTED_PAGES.join(" / ")}（尚未实现的页面见
          temp/research4/harness-notes.md §5）
        </div>
      ) : toastLine ? (
        <div className="k-preview-toast">{toastLine}</div>
      ) : null}
    </AppTheme>
  );
}

// Make sure i18n finished switching language before the first render so the
// fixture strings (date plates, service messages) already use the right pack.
async function bootstrap() {
  try {
    await i18n.changeLanguage(lang);
  } catch (error) {
    console.error("k-preview: language switch failed", error);
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <Preview />,
  );
}

void bootstrap();
