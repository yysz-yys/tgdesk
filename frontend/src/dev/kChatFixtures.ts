/**
 * Dev-only fixtures for the `?page=chat` preview harness (temp/, gitignored
 * consumers only ?never imported by production code).
 *
 * Everything the chat page needs to paint without Wails/kernel lives here:
 * dialog-list rows, the six peer variants (`?peer=channel|admin|group|private|
 * bot|saved`), each variant's `ChatProfile`, a realistic message history that
 * exercises every MessageBubble/MessageMediaView branch (text in/out, photo,
 * album, file + download task, voice, audio, video, webpage, reply, sticker,
 * forwarded, service/date plates, reactions, inline keyboard, views/checks) and
 * the pinned message returned by `onLoadPinnedMessage`.
 *
 * Rules for extending:
 * - keep message ids unique inside a variant and keep `replyToId` pointers
 *   pointing at a message of the same list (MessageList resolves them by id);
 * - keep album entries (`groupedId`) consecutive or MessageBubble will not
 *   group them;
 * - a `DownloadTask` only paints a badge when `task.chatId` and
 *   `task.messageId` match a message of the currently open chat;
 * - media URLs are inline SVG data URLs on purpose: the preview must not fetch
 *   loopback image endpoints that only exist under the real kernel.
 */
import { chatColor, chatInitials } from "../data/telegram";
import i18n from "../i18n";
import type {
  Chat,
  ChatFolder,
  ChatInfo,
  ChatMember,
  ChatProfile,
  DownloadTask,
  Message,
  MessageMedia,
  UploadProgress,
} from "../types";
import type { KNewChatMember } from "../components/k/KNewChatFlow";
import type { RecentPeer } from "../components/k/recentPeersStore";

/** Chat composer capabilities the kernel profile exposes beyond the UI type. */
export type ComposerCapabilityProfile = ChatProfile & {
  isMember?: boolean;
  isBroadcast?: boolean;
  isBroadcastGroup?: boolean;
  canJoin?: boolean;
  joinRequest?: boolean;
  isBlocked?: boolean;
  isAnonymous?: boolean;
  canSendMedia?: boolean;
  linkedMonoforumId?: string;
};

/** The chat-page peer shapes the harness can render. */
export type ChatPeerVariant =
  | "channel"
  | "admin"
  | "group"
  | "private"
  | "bot"
  | "saved"
  // Web K composer capability branches (spec-composer §3/§6):
  | "group-restricted"
  | "group-join"
  | "group-request"
  | "group-anon"
  | "channel-left"
  | "channel-monoforum"
  | "bot-blocked"
  | "bot-history"
  | "bot-commands";

export interface ChatPageFixture {
  chat: Chat;
  profile: ChatProfile;
  messages: Message[];
  /** Returned by onLoadPinnedMessage; null hides the pinned strip. */
  pinned: Message | null;
  downloads: DownloadTask[];
  info: ChatInfo;
  members: ChatMember[];
}

const SELF_NAME = "Geraldine";
const SELF_INITIALS = "G";
const SELF_COLOR = "#8774e1";

function chat(
  partial: Partial<Chat> & Pick<Chat, "id" | "title" | "kind">,
): Chat {
  return {
    preview: "",
    time: "",
    color: chatColor(partial.id),
    initials: chatInitials(partial.title),
    ...partial,
  };
}

/* ---------------------------------------------------------------- avatars */

/** Tiny inline SVG so photos/stickers/webpage thumbs render without network. */
export function svgDataUrl(
  label: string,
  from: string,
  to: string,
  width: number,
  height: number,
): string {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" ` +
    `x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" ` +
    `stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" ` +
    `fill="url(#g)"/><rect x="18" y="18" width="${width - 36}" height="${height - 36}" ` +
    `fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" rx="18"/>` +
    `<text x="50%" y="50%" fill="rgba(255,255,255,.9)" font-family="Roboto,sans-serif" ` +
    `font-size="${Math.round(Math.min(width, height) / 7)}" text-anchor="middle" ` +
    `dominant-baseline="middle">${safeLabel}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const PHOTO_LANDSCAPE = svgDataUrl("Preview photo", "#1f3b73", "#0d1b33", 900, 560);
export const PHOTO_PORTRAIT = svgDataUrl("Portrait", "#5b2c6f", "#1b0a21", 620, 930);
export const PHOTO_ALBUM_A = svgDataUrl("Album 1", "#24406e", "#10233f", 720, 720);
export const PHOTO_ALBUM_B = svgDataUrl("Album 2", "#3f2d5c", "#1b1230", 720, 720);
export const PHOTO_ALBUM_C = svgDataUrl("Album 3", "#1d4a44", "#0c2724", 720, 720);
export const VIDEO_POSTER = svgDataUrl("Screen recording", "#2c3e50", "#0b1520", 960, 540);
export const WEBPAGE_THUMB = svgDataUrl("telegram.org", "#2a7ab9", "#1b4f7a", 640, 480);
export const STICKER_IMAGE = svgDataUrl(":)", "#4f8fd6", "#8c5bd6", 220, 220);

/* ------------------------------------------------------------ dialog list */

/**
 * The reference capture's dialog list (avatars fall back to peer colours),
 * plus one bot row so `?peer=bot` has a dialog to select. Rows double as the
 * fixture `Chat` objects of the peer variants:
 *   channel ?channel:1001:1, admin ?channel:1002:1, private ?user:780:1,
 *   group ?group:787:1, saved ?user:9001:1, bot ?user:73001:1.
 */
export const previewChats: Chat[] = [
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
    username: "design_materials",
    title: "设计素材分享-百科全书📚",
    kind: "channel",
    preview: "Preview message",
    time: "11:55",
    members: "12.8K subscribers",
    verified: true,
  }),
  chat({
    id: "channel:1002:1",
    username: "jiso_search",
    title: "极搜🔍中文搜索@JISO",
    kind: "channel",
    preview: "🧭 发现",
    time: "11:13",
    lastOut: true,
    lastChecks: "read",
    members: "12.8K subscribers",
  }),
  chat({
    id: "user:780:1",
    username: "nova_dev",
    title: "n8n_test",
    kind: "private",
    preview: "archive-sync-1794556850",
    time: "周五",
    online: true,
    status: "online",
  }),
  chat({
    id: "user:4242:1",
    title: "Telegram",
    kind: "private",
    preview: "Preview message",
    time: "周四",
    verified: true,
    status: "lastWeek",
  }),
  chat({
    id: "user:73001:1",
    username: "preview_bot",
    title: "Preview Bot",
    kind: "private",
    preview: "/start",
    time: "10:24",
    bot: true,
  }),
  chat({
    id: "user:787:1",
    title: "TDrive",
    kind: "private",
    preview: "Preview message",
    time: "14:30",
    lastOut: true,
    lastChecks: "sent",
  }),
  chat({
    id: "group:780:1",
    title: "test-频道",
    kind: "group",
    preview: "Preview message",
    time: "14:30",
    lastOut: true,
    lastChecks: "sent",
    ttl: 86_400,
  }),
  chat({
    id: "group:787:1",
    title: "test-群组",
    kind: "group",
    preview: "您已设置消息?1 天后自动删除",
    time: "14:30",
    ttl: 86_400,
    unread: 3,
    lastSender: "Mia",
    lastOut: true,
    lastChecks: "read",
    members: "12.8K subscribers",
  }),
  chat({
    id: "channel:1003:1",
    title: "占位频道",
    kind: "channel",
    preview: "Preview message",
    time: "14:30",
    lastSender: "Placeholder",
    members: "12.8K subscribers",
  }),
  chat({
    id: "archived-old-1",
    title: "云端官方群组",
    kind: "group",
    preview: "Preview message",
    time: "周三",
    archived: true,
    unread: 7,
    muted: true,
    members: "12.8K subscribers",
  }),
  chat({
    id: "archived-old-2",
    title: "工具收藏 | 面板交流",
    kind: "group",
    preview: "公告",
    time: "周三",
    archived: true,
    muted: true,
    members: "12.8K subscribers",
  }),
];

export const previewFolders: ChatFolder[] = [
  { id: 1, title: "123文件夹", chatKeys: [], excludeKeys: [], groups: true },
  { id: 2, title: "222", chatKeys: [], excludeKeys: [], broadcasts: true },
  { id: 3, title: "222", chatKeys: [], excludeKeys: [], contacts: true },
  { id: 4, title: "22222", chatKeys: [], excludeKeys: [], bots: true },
];

/* ------------------------------------------------ Chats tip card peers */

/**
 * `?tipsData=` fixtures for the third tip card (temp/refs-r4/3-tips-chats.png,
 * tweb components/chatTips/chatsCard.tsx). The reference state is
 * `tipsData=searched`: an empty Popular list (the account has "Suggest Frequent
 * Contacts" off, so contacts.getTopPeers answers nothing), five Searched peers
 * with the letter-avatar bot "CreateBot" last, and two Closed peers ?only the
 * Searched and Closed filters then exist.
 *
 * The peers are ordinary Chat objects: the card merges the recorded snapshot
 * ids with the live dialog list, so these must be resolvable to paint an avatar
 * (`previewTipChats` puts them in the fixture chat list the card resolves
 * against). Avatars are inline SVG data URLs, like the rest of the harness.
 */
export const previewTopPeers: Chat[] = [
  chat({
    id: "user:551:1",
    title: "Анна Соколова",
    kind: "private",
    avatarUrl: svgDataUrl("А", "#d4786f", "#8a3b52", 108, 108),
  }),
  chat({
    id: "user:552:1",
    title: "Marc Dubois",
    kind: "private",
  }),
  chat({
    id: "user:553:1",
    title: "Yuki Tanaka",
    kind: "private",
    avatarUrl: svgDataUrl("Y", "#4a7fd4", "#1c2f66", 108, 108),
  }),
  chat({
    id: "user:554:1",
    title: "DeepSeek Bot",
    kind: "private",
    bot: true,
    avatarUrl: svgDataUrl("DS", "#3fb27f", "#155c42", 108, 108),
  }),
  chat({
    id: "user:555:1",
    title: "Nadia",
    kind: "private",
    avatarUrl: svgDataUrl("N", "#c9a24a", "#7a5a13", 108, 108),
  }),
  chat({
    id: "group:801:1",
    title: "Design Team",
    kind: "group",
  }),
  chat({
    id: "channel:1201:1",
    title: "Telegram News",
    kind: "channel",
    verified: true,
  }),
  chat({
    id: "user:556:1",
    title: "Pixel Art Bot",
    kind: "private",
    bot: true,
  }),
];

/** A 9th Popular row: `?tipsData=cap9` proves the card trims the grid to 8. */
export const previewTopPeersOverflow: Chat[] = [
  ...previewTopPeers,
  chat({ id: "user:557:1", title: "Overflow Row", kind: "private" }),
];

/** The reference screenshot's Searched list, newest first, CreateBot last. */
export const previewRecentSearchPeers: Chat[] = [
  chat({
    id: "user:91001:1",
    title: "Waltrax",
    kind: "private",
    avatarUrl: svgDataUrl("W", "#e7c7a1", "#a4582f", 108, 108),
  }),
  chat({
    id: "user:91002:1",
    // A bot, so the tile keeps the whole title ("User Info Bot", ellipsized at
    // 65px like the reference's "User Info ?).
    title: "User Info Bot",
    kind: "private",
    bot: true,
    avatarUrl: svgDataUrl("ID", "#5f5f5f", "#1f1f1f", 108, 108),
  }),
  chat({
    id: "user:91003:1",
    title: "Gemini Pro Automation Bot",
    kind: "private",
    bot: true,
    avatarUrl: svgDataUrl("G", "#f2d7ac", "#8a5a1c", 108, 108),
  }),
  chat({
    id: "user:91004:1",
    title: "BotFather",
    kind: "private",
    bot: true,
    avatarUrl: svgDataUrl("BF", "#5e83c4", "#20355c", 108, 108),
  }),
  chat({
    id: "user:91005:1",
    // The reference's letter avatar: "C", green gradient (a bot's raw id % 7
    // picks the palette entry; pinned here so the fixture does not depend on it).
    title: "CreateBot",
    kind: "private",
    bot: true,
    colorIndex: 3,
  }),
];

/** The reference screenshot's Closed list (never selected in the reference). */
export const previewRecentlyClosedPeers: Chat[] = [
  chat({ id: "group:788:1", title: "Archive Team", kind: "group" }),
  chat({ id: "channel:1004:1", title: "占位频道 2", kind: "channel" }),
];

/** Snapshot form of a fixture peer, as the recent-peers store keeps it. */
function recentPeer(entry: Chat): RecentPeer {
  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    colorIndex: entry.colorIndex,
    bot: entry.bot || undefined,
  };
}

export const previewRecentSearch: RecentPeer[] =
  previewRecentSearchPeers.map(recentPeer);
export const previewRecentlyClosed: RecentPeer[] =
  previewRecentlyClosedPeers.map(recentPeer);

/**
 * The fixture dialog list the Chats card resolves recorded peer ids against:
 * the reference rows plus the tip-card peers (their avatars live here; the
 * stored snapshots deliberately carry no avatar URL).
 */
export const previewTipChats: Chat[] = [
  ...previewChats,
  ...previewRecentSearchPeers,
  ...previewRecentlyClosedPeers,
  ...previewTopPeersOverflow,
];

/** Add-members search results for the new-group flow. */
export const previewPeople: KNewChatMember[] = [
  { id: 9001, name: "周康哲", username: "zhoukangzhe" },
  { id: 780, name: "Nova", username: "nova_dev" },
  { id: 4242, name: "Telegram", username: "telegram" },
  { id: 787, name: "TDrive", username: "tdrive_bot" },
  { id: 1001, name: "设计素材分享", username: "design_materials" },
  { id: 1002, name: "极搜中文搜索", username: "jiso_search" },
  { id: 73001, name: "Preview Bot", username: "preview_bot" },
  { id: 55555, name: "林小满", username: "linxiaoman" },
];

/* ------------------------------------------------------------- downloads */

function downloadTask(
  chatId: string,
  messageId: number,
  name: string,
  size: string,
  status: DownloadTask["status"],
  progress: number,
  ext: string,
  color: string,
): DownloadTask {
  return {
    id: `fixture-${chatId}-${messageId}`,
    name,
    chat: chatLocalTitle(chatId),
    chatId,
    messageId,
    size,
    progress,
    speed: status === "active" ? "1.8 MB/s" : undefined,
    eta: "2 min",
    status,
    ext,
    color,
  };
}

/** Reverse lookup keeps the task's `chat` label in sync with the fixture row. */
function chatLocalTitle(chatId: string): string {
  return previewChats.find((item) => item.id === chatId)?.title ?? "Preview";
}

/* -------------------------------------------------------------- messages */

/** A message seed: everything except the chat id, with incoming as the default. */
type MessageSeed = Partial<Message> & Pick<Message, "id" | "time" | "date">;

function message(chatId: string, seed: MessageSeed): Message {
  return { chatId, out: false, ...seed };
}

function voiceMedia(duration: number): MessageMedia {
  return {
    kind: "voice",
    name: "Voice message",
    duration,
    size: "128 KB",
    waveform: Array.from({ length: 36 }, (_, index) => 4 + ((index * 7) % 22)),
  };
}

function audioMedia(): MessageMedia {
  return {
    kind: "audio",
    name: "Night Drive",
    title: "Night Drive",
    performer: "Mia",
    duration: 183,
    color: "#7bc862",
  };
}

function videoMedia(): MessageMedia {
  return {
    kind: "video",
    name: "screen-recording.mp4",
    thumbUrl: VIDEO_POSTER,
    duration: 42,
    width: 960,
    height: 540,
    size: "8.6 MB",
    ext: "MP4",
    mime: "video/mp4",
  };
}

function webpageMedia(): MessageMedia {
  return {
    kind: "webpage",
    name: "Telegram Blog",
    title: "Telegram Web K is now open source",
    description:
      "Telegram Web K 2.3 ?the latest web client built with the Web K framework.",
    url: "https://telegram.org/blog",
    siteName: "telegram.org",
    thumbUrl: WEBPAGE_THUMB,
  };
}

function stickerMedia(): MessageMedia {
  return {
    kind: "sticker",
    name: "Sticker",
    emoji: "🙂",
    ext: "WEBP",
    photoUrl: STICKER_IMAGE,
    thumbUrl: STICKER_IMAGE,
    width: 220,
    height: 220,
  };
}

function photoMedia(name: string, thumbUrl: string, width: number, height: number): MessageMedia {
  return {
    kind: "photo",
    name,
    photoUrl: thumbUrl,
    thumbUrl,
    placeholderUrl: thumbUrl,
    width,
    height,
    size: "2.4 MB",
    ext: "JPG",
  };
}

/**
 * Group history: every message shape in one list (date plate + joined service,
 * text in/out with reply & checks, photo, 3-item album, file with an active
 * download task + idle file for the hover download button, voice, audio, video,
 * webpage, sticker, forwarded, edited, reactions, hashtag/bold entities, a bot
 * inline keyboard and a TTL service plate). Long enough to scroll the pane.
 */
function groupMessages(chatId: string): Message[] {
  return [
    message(chatId, {
      id: 1001,
      date: i18n.t("time.yesterday"),
      time: "21:02",
      service: i18n.t("service.join", { name: "Mia" }),
      serviceKind: "joined",
      serviceActor: "Mia",
    }),
    message(chatId, {
      id: 1002,
      date: i18n.t("time.yesterday"),
      time: "22:15",
      out: false,
      sender: "Mia",
      senderId: "mia",
      text: "Fixture message with #design and @nova_dev links",
      pinned: true,
    }),
    message(chatId, {
      id: 1003,
      date: i18n.t("time.yesterday"),
      time: "22:17",
      out: false,
      sender: "Leo",
      senderId: "leo",
      text: "Fixture message with #design and @nova_dev links",
    }),
    message(chatId, {
      id: 1004,
      date: i18n.t("time.today"),
      time: "09:12",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      checks: "read",
      replyToId: 1003,
      replyToText: "Placeholder",
    }),
    message(chatId, {
      id: 1005,
      date: i18n.t("time.today"),
      time: "09:20",
      out: false,
      sender: "Mia",
      senderId: "mia",
      text: "Fixture message with #design and @nova_dev links",
      media: photoMedia("reference.jpg", PHOTO_LANDSCAPE, 900, 560),
    }),
    message(chatId, {
      id: 1006,
      date: i18n.t("time.today"),
      time: "09:24",
      out: false,
      sender: "Leo",
      senderId: "leo",
      text: "Fixture message with #design and @nova_dev links",
      groupedId: "album-preview",
      media: photoMedia("poster-1.jpg", PHOTO_ALBUM_A, 720, 720),
    }),
    message(chatId, {
      id: 1007,
      date: i18n.t("time.today"),
      time: "09:24",
      out: false,
      sender: "Leo",
      senderId: "leo",
      groupedId: "album-preview",
      media: photoMedia("poster-2.jpg", PHOTO_ALBUM_B, 720, 720),
    }),
    message(chatId, {
      id: 1008,
      date: i18n.t("time.today"),
      time: "09:24",
      out: false,
      sender: "Leo",
      senderId: "leo",
      groupedId: "album-preview",
      media: {
        kind: "video",
        name: "poster-loop.mp4",
        thumbUrl: PHOTO_ALBUM_C,
        duration: 12,
        width: 720,
        height: 720,
        size: "3.1 MB",
        ext: "MP4",
      },
    }),
    message(chatId, {
      id: 1009,
      date: i18n.t("time.today"),
      time: "09:31",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      checks: "read",
      media: {
        kind: "file",
        name: "design-spec.pdf",
        size: "4.2 MB",
        ext: "PDF",
        color: "#d9537f",
      },
    }),
    message(chatId, {
      id: 1010,
      date: i18n.t("time.today"),
      time: "09:33",
      out: false,
      sender: "Mia",
      senderId: "mia",
      media: {
        kind: "file",
        name: "brand-assets.zip",
        size: "128 MB",
        ext: "ZIP",
        color: "#f59e0b",
      },
    }),
    message(chatId, {
      id: 1011,
      date: i18n.t("time.today"),
      time: "09:40",
      out: false,
      sender: "Mia",
      senderId: "mia",
      media: voiceMedia(12),
    }),
    message(chatId, {
      id: 1012,
      date: i18n.t("time.today"),
      time: "09:42",
      out: false,
      sender: "Leo",
      senderId: "leo",
      media: audioMedia(),
    }),
    message(chatId, {
      id: 1013,
      date: i18n.t("time.today"),
      time: "09:48",
      out: false,
      sender: "Mia",
      senderId: "mia",
      text: "Fixture message with #design and @nova_dev links",
      media: videoMedia(),
    }),
    message(chatId, {
      id: 1014,
      date: i18n.t("time.today"),
      time: "09:55",
      out: false,
      sender: "Leo",
      senderId: "leo",
      text: "参考这个页?https://telegram.org/blog",
      media: webpageMedia(),
    }),
    message(chatId, {
      id: 1015,
      date: i18n.t("time.today"),
      time: "10:01",
      out: false,
      sender: "Mia",
      senderId: "mia",
      media: stickerMedia(),
    }),
    message(chatId, {
      id: 1016,
      date: i18n.t("time.today"),
      time: "10:08",
      out: false,
      sender: "设计助手",
      senderId: "bot-designer",
      text: "图标规范检查完成，选择下一步：",
      buttons: [
        {
          text: "查看报告",
          kind: "callback",
          data: "report",
          row: 0,
          style: "primary",
        },
        {
          text: "打开规范",
          kind: "url",
          url: "https://telegram.org/blog",
          row: 0,
        },
        {
          text: "在应用中预览",
          kind: "webview",
          url: "https://telegram.org/blog",
          row: 1,
        },
        { text: "复制链接", kind: "copy", row: 2, style: "success" },
      ],
    }),
    message(chatId, {
      id: 1017,
      date: i18n.t("time.today"),
      time: "10:14",
      out: false,
      sender: "Mia",
      senderId: "mia",
      text: "Fixture message with #design and @nova_dev links",
      reactions: [
        { emoji: "👍", count: 12, chosen: true },
        { emoji: "🔥", count: 3 },
      ],
    }),
    message(chatId, {
      id: 1018,
      date: i18n.t("time.today"),
      time: "10:20",
      out: false,
      forwarded: true,
      forwardedFrom: "设计素材分享-百科全书📚",
      forwardedDate: 1_760_000_000,
      text: "转发一条素材链?https://t.me/design_materials",
      sender: "Leo",
      senderId: "leo",
    }),
    message(chatId, {
      id: 1019,
      date: i18n.t("time.today"),
      time: "10:26",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      checks: "read",
      editDate: 1_760_000_100,
      entities: [{ type: "bold", offset: 4, length: 4 }],
    }),
    message(chatId, {
      id: 1020,
      date: i18n.t("time.today"),
      time: "10:31",
      out: false,
      sender: "Leo",
      senderId: "lin",
      text: "Fixture message with #design and @nova_dev links",
      entities: [
        { type: "hashtag", offset: 4, length: 5 },
        { type: "mention", offset: 12, length: 10 },
      ],
    }),
    message(chatId, {
      id: 1021,
      date: i18n.t("time.today"),
      time: "10:40",
      service: i18n.t("service.ttlDays", { count: 1 }),
      serviceKind: "ttl",
    }),
    message(chatId, {
      id: 1022,
      date: i18n.t("time.today"),
      time: "10:42",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      checks: "sent",
    }),
  ];
}

/** Broadcast channel posts: incoming only; the admin variant adds own posts. */
function channelMessages(chatId: string, admin: boolean): Message[] {
  return [
    message(chatId, {
      id: 2001,
      date: i18n.t("time.yesterday"),
      time: "18:02",
      text: "Fixture message with #design and @nova_dev links",
      pinned: true,
      views: 12_400,
      forwards: 86,
      out: false,
    }),
    message(chatId, {
      id: 2002,
      date: i18n.t("time.yesterday"),
      time: "18:05",
      text: "Fixture message with #design and @nova_dev links",
      media: photoMedia("icons-preview.jpg", PHOTO_LANDSCAPE, 900, 560),
      views: 9_820,
      forwards: 51,
      out: false,
    }),
    message(chatId, {
      id: 2003,
      date: i18n.t("time.yesterday"),
      time: "18:06",
      groupedId: "channel-album",
      media: photoMedia("icon-1.jpg", PHOTO_ALBUM_A, 720, 720),
      out: false,
    }),
    message(chatId, {
      id: 2004,
      date: i18n.t("time.yesterday"),
      time: "18:06",
      groupedId: "channel-album",
      media: photoMedia("icon-2.jpg", PHOTO_ALBUM_B, 720, 720),
      out: false,
    }),
    message(chatId, {
      id: 2005,
      date: i18n.t("time.today"),
      time: "09:10",
      text: "素材包下载：",
      media: {
        kind: "file",
        name: "design-materials-2026.zip",
        size: "86 MB",
        ext: "ZIP",
        color: "#7c5cf5",
      },
      views: 5_101,
      out: false,
    }),
    message(chatId, {
      id: 2006,
      date: i18n.t("time.today"),
      time: "09:12",
      text: "频道说明与投稿指?https://telegram.org/blog",
      media: webpageMedia(),
      views: 3_204,
      out: false,
    }),
    message(chatId, {
      id: 2007,
      date: i18n.t("time.today"),
      time: "11:55",
      media: stickerMedia(),
      views: 2_002,
      reactions: [{ emoji: "❤️", count: 214, chosen: true }],
      out: false,
    }),
    ...(admin
      ? [
          message(chatId, {
            id: 2008,
            date: i18n.t("time.today"),
            time: "12:04",
            out: true,
            text: "Fixture message with #design and @nova_dev links",
            checks: "read",
            views: 780,
            postAuthor: "Geraldine",
          }),
          message(chatId, {
            id: 2009,
            date: i18n.t("time.today"),
            time: "12:06",
            out: true,
            checks: "read",
            media: videoMedia(),
            views: 640,
          }),
        ]
      : []),
  ];
}

/** Direct (private) chat: two-way history, no sender names/avatars. */
function privateMessages(chatId: string): Message[] {
  return [
    message(chatId, {
      id: 3001,
      date: i18n.t("time.yesterday"),
      time: "20:11",
      out: false,
      sender: "Nova",
      senderId: "780",
      text: "Fixture message with #design and @nova_dev links",
      pinned: true,
    }),
    message(chatId, {
      id: 3002,
      date: i18n.t("time.yesterday"),
      time: "20:14",
      out: false,
      sender: "Nova",
      senderId: "780",
      media: {
        kind: "file",
        name: "archive-sync.log",
        size: "48 KB",
        ext: "LOG",
        color: "#6b8bff",
      },
    }),
    message(chatId, {
      id: 3003,
      date: i18n.t("time.today"),
      time: "08:55",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      checks: "read",
      replyToId: 3001,
      replyToText: "Placeholder",
    }),
    message(chatId, {
      id: 3004,
      date: i18n.t("time.today"),
      time: "09:02",
      out: false,
      sender: "Nova",
      senderId: "780",
      media: photoMedia("dashboard.png", PHOTO_LANDSCAPE, 900, 560),
    }),
    message(chatId, {
      id: 3005,
      date: i18n.t("time.today"),
      time: "09:03",
      out: false,
      sender: "Nova",
      senderId: "780",
      groupedId: "dm-album",
      media: photoMedia("chart-1.png", PHOTO_ALBUM_A, 720, 720),
    }),
    message(chatId, {
      id: 3006,
      date: i18n.t("time.today"),
      time: "09:03",
      out: false,
      sender: "Nova",
      senderId: "780",
      groupedId: "dm-album",
      media: photoMedia("chart-2.png", PHOTO_ALBUM_B, 720, 720),
    }),
    message(chatId, {
      id: 3007,
      date: i18n.t("time.today"),
      time: "09:10",
      out: false,
      sender: "Nova",
      senderId: "780",
      media: voiceMedia(8),
    }),
    message(chatId, {
      id: 3008,
      date: i18n.t("time.today"),
      time: "09:14",
      out: false,
      sender: "Nova",
      senderId: "780",
      media: audioMedia(),
    }),
    message(chatId, {
      id: 3009,
      date: i18n.t("time.today"),
      time: "09:20",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      checks: "read",
      media: videoMedia(),
    }),
    message(chatId, {
      id: 3010,
      date: i18n.t("time.today"),
      time: "09:24",
      out: false,
      sender: "Nova",
      senderId: "780",
      text: "这个页面的数据好?https://telegram.org/blog",
      media: webpageMedia(),
    }),
    message(chatId, {
      id: 3011,
      date: i18n.t("time.today"),
      time: "09:30",
      out: false,
      sender: "Nova",
      senderId: "780",
      media: stickerMedia(),
    }),
    message(chatId, {
      id: 3012,
      date: i18n.t("time.today"),
      time: "09:36",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      checks: "sent",
    }),
    message(chatId, {
      id: 3013,
      date: i18n.t("time.today"),
      time: "09:41",
      out: false,
      sender: "Nova",
      senderId: "780",
      text: "辛苦?👍",
      reactions: [{ emoji: "👍", count: 2, chosen: true }],
    }),
  ];
}

/** Saved Messages: every message is outgoing (from the account itself). */
function savedMessages(chatId: string): Message[] {
  return [
    message(chatId, {
      id: 4001,
      date: i18n.t("time.yesterday"),
      time: "14:02",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      pinned: true,
    }),
    message(chatId, {
      id: 4002,
      date: i18n.t("time.yesterday"),
      time: "14:05",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      media: photoMedia("webk-reference.png", PHOTO_LANDSCAPE, 900, 560),
    }),
    message(chatId, {
      id: 4003,
      date: i18n.t("time.yesterday"),
      time: "14:07",
      out: true,
      text: "设计稿坐?https://telegram.org/blog",
      media: webpageMedia(),
    }),
    message(chatId, {
      id: 4004,
      date: i18n.t("time.today"),
      time: "10:12",
      out: true,
      media: {
        kind: "file",
        name: "notes.md",
        size: "12 KB",
        ext: "MD",
        color: "#10b981",
      },
    }),
    message(chatId, {
      id: 4005,
      date: i18n.t("time.today"),
      time: "10:15",
      out: true,
      media: voiceMedia(23),
    }),
    message(chatId, {
      id: 4006,
      date: i18n.t("time.today"),
      time: "10:20",
      out: true,
      media: audioMedia(),
    }),
    message(chatId, {
      id: 4007,
      date: i18n.t("time.today"),
      time: "10:26",
      out: true,
      media: videoMedia(),
    }),
    message(chatId, {
      id: 4008,
      date: i18n.t("time.today"),
      time: "10:31",
      out: true,
      media: stickerMedia(),
    }),
    message(chatId, {
      id: 4009,
      date: i18n.t("time.today"),
      time: "10:36",
      out: true,
      text: "Fixture message with #design and @nova_dev links",
      replyToId: 4001,
      replyToText: "Placeholder",
      reactions: [{ emoji: "👌", count: 1, chosen: true }],
    }),
  ];
}

/* --------------------------------------------------------------- profiles */

function profile(
  partial: Partial<ChatProfile> & Pick<ChatProfile, "type">,
): ChatProfile {
  return {
    members: 0,
    canViewMembers: false,
    canSend: true,
    canSendPlain: true,
    ...partial,
  };
}

/**
 * Builds a profile with the round-4 composer capability fields. They are not in
 * types.ts yet (the Lead wires them together with the bindings regen), so the
 * fixture casts locally instead of touching the shared type.
 */
function capabilityProfile(
  partial: Partial<ComposerCapabilityProfile> & Pick<ChatProfile, "type">,
): ChatProfile {
  return profile(partial) as ComposerCapabilityProfile;
}

const previewMembers: ChatMember[] = [
  { id: "member-mia", name: "Mia", username: "mia", admin: true },
  { id: "member-leo", name: "Leo", username: "leo" },
  { id: "member-alex", name: "Alex Chen", username: "alexchen" },
  { id: "member-lin", name: "Fixture", username: "fixture" },
  { id: "member-bot", name: "设计助手", bot: true },
];

function chatInfo(members: number, canViewMembers: boolean): ChatInfo {
  return {
    members,
    canViewMembers,
    countsKnown: true,
    counts: [
      { section: "media", count: 12 },
      { section: "files", count: 2 },
      { section: "links", count: 3 },
      { section: "music", count: 1 },
      { section: "voice", count: 2 },
      { section: "gifs", count: 1 },
    ],
  };
}

function findChat(id: string): Chat {
  const found = previewChats.find((item) => item.id === id);
  if (!found) {
    throw new Error(`kChatFixtures: missing dialog fixture ${id}`);
  }
  return found;
}

/**
 * Builds everything the `?page=chat&peer=…` preview passes to ChatView.
 * `overrides.profile` lets state deep links add slow mode / restrictions
 * without forking the fixtures.
 */
export function chatPageFixture(
  variant: ChatPeerVariant,
  overrides: { profile?: Partial<ChatProfile> } = {},
): ChatPageFixture {
  switch (variant) {
    case "channel": {
      const target = findChat("channel:1001:1");
      const messages = channelMessages(target.id, false);
      return {
        chat: target,
        profile: profile({
          type: "channel",
          members: 12_840,
          canViewMembers: false,
          canSend: false,
          canSendPlain: false,
          sendRestriction: "broadcast",
          usernames: ["design_materials"],
          about: "Preview harness bot.",
          ...overrides.profile,
        }),
        messages,
        pinned: messages[0] ?? null,
        downloads: [
          downloadTask(
            target.id,
            2005,
            "design-materials-2026.zip",
            "86 MB",
            "active",
            42,
            "zip",
            "#7c5cf5",
          ),
        ],
        info: chatInfo(12_840, false),
        members: [],
      };
    }
    case "admin": {
      const target = findChat("channel:1002:1");
      const messages = channelMessages(target.id, true);
      return {
        chat: target,
        profile: profile({
          type: "channel",
          members: 1_240,
          canViewMembers: true,
          isAdmin: true,
          canSend: true,
          canSendPlain: true,
          usernames: ["jiso_search"],
          about: "Preview harness bot.",
          ...overrides.profile,
        }),
        messages,
        pinned: messages[0] ?? null,
        downloads: [
          downloadTask(
            target.id,
            2005,
            "design-materials-2026.zip",
            "86 MB",
            "active",
            42,
            "zip",
            "#7c5cf5",
          ),
        ],
        info: chatInfo(1_240, true),
        members: previewMembers,
      };
    }
    case "group": {
      const target = findChat("group:787:1");
      const messages = groupMessages(target.id);
      return {
        chat: target,
        profile: profile({
          type: "group",
          members: 7,
          canViewMembers: true,
          isAdmin: true,
          inviteLink: "https://t.me/+preview-group",
          botCommands: [
            { command: "start", description: "Start the bot", botUsername: "helper_bot" },
            { command: "help", description: "查看帮助", botUsername: "helper_bot" },
          ],
          ...overrides.profile,
        }),
        messages,
        pinned: messages[1] ?? null,
        downloads: [
          downloadTask(
            target.id,
            1009,
            "design-spec.pdf",
            "4.2 MB",
            "active",
            42,
            "pdf",
            "#d9537f",
          ),
        ],
        info: chatInfo(7, true),
        members: previewMembers,
      };
    }
    case "private": {
      const target = findChat("user:780:1");
      const messages = privateMessages(target.id);
      return {
        chat: target,
        profile: profile({
          type: "user",
          username: "nova_dev",
          about: "n8n / automation",
          online: true,
          status: "online",
          ...overrides.profile,
        }),
        messages,
        pinned: messages[0] ?? null,
        downloads: [
          downloadTask(
            target.id,
            3002,
            "archive-sync.log",
            "48 KB",
            "paused",
            80,
            "log",
            "#6b8bff",
          ),
        ],
        info: chatInfo(0, false),
        members: [],
      };
    }
    case "bot": {
      const target = findChat("user:73001:1");
      // No history on purpose: ChatView passes hasMessages=false, so the
      // composer renders Web K's START plate instead of the message composer.
      return {
        chat: target,
        profile: profile({
          type: "bot",
          username: "preview_bot",
          about: "Preview harness bot  with no message history yet.",
          botCommands: [
            { command: "start", description: "Start the bot" },
            { command: "help", description: "查看帮助" },
            { command: "settings", description: "打开设置" },
          ],
          botMenuButton: {
            type: "webapp",
            text: "打开预览应用",
            url: "https://telegram.org/blog",
          },
          ...overrides.profile,
        }),
        messages: [],
        pinned: null,
        downloads: [],
        info: chatInfo(0, false),
        members: [],
      };
    }
    case "saved": {
      const target = findChat("user:9001:1");
      const messages = savedMessages(target.id);
      return {
        chat: target,
        profile: profile({
          type: "saved",
          messagesCount: 42,
          ...overrides.profile,
        }),
        messages,
        pinned: messages[0] ?? null,
        downloads: [
          downloadTask(target.id, 4004, "notes.md", "12 KB", "failed", 38, "md", "#10b981"),
        ],
        info: chatInfo(0, false),
        members: [],
      };
    }
    /* ------------------------------------------------- round-4 capability
     * fixtures: the composer's Web K branches that the old six peers could not
     * reach (restricted member, join / apply-to-join, anonymous admin, channel
     * subscriber vs. left/not-subscribed, monoforum comments, blocked bot,
     * bot with history + command list + web-app menu). */
    case "group-restricted": {
      const target = findChat("group:787:1");
      const messages = groupMessages(target.id);
      return {
        chat: target,
        profile: capabilityProfile({
          type: "group",
          members: 7,
          canViewMembers: true,
          canSend: false,
          canSendPlain: false,
          canSendMedia: false,
          canSendStickers: false,
          canSendGifs: false,
          sendRestriction: "restricted",
          isMember: true,
          botCommands: [
            { command: "setup", description: "配置群组", botUsername: "setup_bot" },
          ],
          ...overrides.profile,
        }),
        messages,
        pinned: messages[1] ?? null,
        downloads: [],
        info: chatInfo(7, true),
        members: previewMembers,
      };
    }
    case "group-join": {
      const target = findChat("group:787:1");
      const messages = groupMessages(target.id);
      return {
        chat: target,
        profile: capabilityProfile({
          type: "group",
          members: 7,
          canViewMembers: true,
          canSend: false,
          canSendPlain: false,
          sendRestriction: "not-member",
          isMember: false,
          canJoin: true,
          ...overrides.profile,
        }),
        messages,
        pinned: null,
        downloads: [],
        info: chatInfo(7, true),
        members: previewMembers,
      };
    }
    case "group-request": {
      const target = findChat("group:787:1");
      const messages = groupMessages(target.id);
      return {
        chat: target,
        profile: capabilityProfile({
          type: "group",
          members: 7,
          canViewMembers: false,
          canSend: false,
          canSendPlain: false,
          sendRestriction: "not-member",
          isMember: false,
          canJoin: true,
          joinRequest: true,
          ...overrides.profile,
        }),
        messages,
        pinned: null,
        downloads: [],
        info: chatInfo(7, false),
        members: [],
      };
    }
    case "group-anon": {
      const target = findChat("group:787:1");
      const messages = groupMessages(target.id);
      return {
        chat: target,
        profile: capabilityProfile({
          type: "group",
          members: 7,
          canViewMembers: true,
          isAdmin: true,
          isAnonymous: true,
          botCommands: [
            { command: "start", description: "Start the bot", botUsername: "helper_bot" },
            { command: "help", description: "查看帮助", botUsername: "helper_bot" },
          ],
          ...overrides.profile,
        }),
        messages,
        pinned: messages[1] ?? null,
        downloads: [],
        info: chatInfo(7, true),
        members: previewMembers,
      };
    }
    case "channel-left": {
      const target = findChat("channel:1001:1");
      const messages = channelMessages(target.id, false);
      return {
        chat: target,
        profile: capabilityProfile({
          type: "channel",
          members: 12_840,
          canViewMembers: false,
          canSend: false,
          canSendPlain: false,
          sendRestriction: "broadcast",
          isMember: false,
          canJoin: true,
          isBroadcast: true,
          usernames: ["design_materials"],
          ...overrides.profile,
        }),
        messages,
        pinned: null,
        downloads: [],
        info: chatInfo(12_840, false),
        members: [],
      };
    }
    case "channel-monoforum": {
      const target = findChat("channel:1001:1");
      const messages = channelMessages(target.id, false);
      return {
        chat: target,
        profile: capabilityProfile({
          type: "channel",
          members: 12_840,
          canViewMembers: false,
          canSend: false,
          canSendPlain: false,
          sendRestriction: "broadcast",
          isMember: true,
          isBroadcast: true,
          linkedMonoforumId: "channel:1003:1",
          usernames: ["design_materials"],
          ...overrides.profile,
        }),
        messages,
        pinned: null,
        downloads: [],
        info: chatInfo(12_840, false),
        members: [],
      };
    }
    case "bot-blocked": {
      const target = findChat("user:73001:1");
      return {
        chat: target,
        profile: capabilityProfile({
          type: "bot",
          username: "preview_bot",
          about: "Preview harness bot  blocked.",
          isBlocked: true,
          botCommands: [],
          ...overrides.profile,
        }),
        messages: [],
        pinned: null,
        downloads: [],
        info: chatInfo(0, false),
        members: [],
      };
    }
    case "bot-history": {
      const target = findChat("user:73001:1");
      const messages = botMessages(target.id);
      return {
        chat: target,
        profile: capabilityProfile({
          type: "bot",
          username: "preview_bot",
          about: "Preview harness bot with history and a web-app menu.",
          canSendMedia: true,
          botCommands: [
            { command: "start", description: "Start the bot" },
            { command: "settings", description: "打开设置", botUsername: "preview_bot" },
          ],
          botMenuButton: {
            type: "webapp",
            text: "打开预览应用",
            url: "https://telegram.org/blog",
          },
          ...overrides.profile,
        }),
        messages,
        pinned: messages[0] ?? null,
        downloads: [],
        info: chatInfo(0, false),
        members: [],
      };
    }
    case "bot-commands": {
      const target = findChat("user:73001:1");
      const messages = botMessages(target.id);
      return {
        chat: target,
        profile: capabilityProfile({
          type: "bot",
          username: "preview_bot",
          about: "Preview harness bot with a command list.",
          canSendMedia: true,
          botCommands: [
            { command: "start", description: "Start the bot" },
            { command: "help", description: "查看帮助", botUsername: "preview_bot" },
            { command: "settings", description: "打开设置", botUsername: "preview_bot" },
            { command: "privacy", description: "隐私政策", botUsername: "preview_bot" },
          ],
          botMenuButton: { type: "default" },
          ...overrides.profile,
        }),
        messages,
        pinned: null,
        downloads: [],
        info: chatInfo(0, false),
        members: [],
      };
    }
  }
}

/** A bot conversation: the private history with the bot as every sender. */
function botMessages(chatId: string): Message[] {
  return privateMessages(chatId).map((item) =>
    item.out || item.service ? item : { ...item, sender: "Preview Bot" },
  );
}

/** The composer upload row used by `?state=upload`. */
export const previewUpload: UploadProgress = {
  id: "fixture-upload-1",
  name: "screenshot.png",
  progress: 0.37,
};

/** Account identity shared by KChatList/KSettings/ChatView fixture props. */
export const previewSelf = {
  name: SELF_NAME,
  initials: SELF_INITIALS,
  color: SELF_COLOR,
};

/**
 * Chat-list typing indicators: the round-4 chat-list work adds typing state to
 * KChatList/KChatRow; those components do not accept it yet (checked at harness
 * build time). Keep the fixture ids here and pass them to the list once its
 * prop exists, e.g. `typingChatIds={previewTypingChatIds}` in KPreview.tsx.
 * Presence that the components DO accept today comes from the Chat fields
 * `online` / `status` / `lastSeen` (private and Telegram fixtures above).
 */
export const previewTypingChatIds = ["group:787:1", "user:780:1"];

/** Read-only cap for a "state=slow" deep link (channel admin composer). */
export function slowModeProfile(base: ChatProfile): ChatProfile {
  return {
    ...base,
    slowModeSeconds: 30,
    slowModeNextSendDate: Math.floor(Date.now() / 1000) + 30,
  };
}
