import type { TDataExport } from "../bindings/tgdesk/internal/kernel/models";

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  phone?: string;
  restricted?: boolean;
  restriction?: string;
  displayName: string;
  initials: string;
  color: string;
}

export type AuthEventState =
  | "idle"
  | "starting"
  | "qr"
  | "code"
  | "password"
  | "verifying"
  | "success"
  | "error"
  | "cancelled";

export interface AuthEvent {
  state: AuthEventState;
  qrUrl?: string;
  qrExpiresIn?: number;
  phone?: string;
  codeType?: string;
  codeLength?: number;
  codeTimeout?: number;
  resent?: boolean;
  passwordHint?: string;
  nextCodeType?: string;
  errorCode?: string;
  retryAfter?: number;
  user?: AuthUser;
  error?: string;
  tData?: TDataExport;
  tDataError?: string;
}

export type ChatKind = "private" | "group" | "channel";

/**
 * Peer presence as Telegram exposes it. "recently"/"lastWeek"/"lastMonth" are
 * the privacy-preserving coarse statuses; "hidden" means the peer hides it.
 */
export type UserStatusKind =
  | "online"
  | "offline"
  | "recently"
  | "lastWeek"
  | "lastMonth"
  | "hidden";

export interface Chat {
  id: string;
  title: string;
  kind: ChatKind;
  username?: string;
  preview: string;
  time: string;
  avatarUrl?: string;
  unread?: number;
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
  bot?: boolean;
  contact?: boolean;
  /** True for the Saved Messages peer (the private chat with yourself). */
  saved?: boolean;
  online?: boolean;
  /** Unix seconds of the last-seen timestamp (0 when unknown/coarse). */
  lastSeen?: number;
  /** Privacy-preserving presence category. */
  status?: UserStatusKind;
  verified?: boolean;
  members?: string;
  memberCount?: number;
  color: string;
  initials: string;
}

/** Saved Messages 2.0: the source chats messages were forwarded from. */
export interface SavedChats {
  chats: Chat[];
  count: number;
}

export interface ChatFolder {
  id: number;
  title: string;
  emoticon?: string;
  chatKeys: string[];
  excludeKeys: string[];
  groups?: boolean;
  broadcasts?: boolean;
  contacts?: boolean;
  nonContacts?: boolean;
  bots?: boolean;
  excludeMuted?: boolean;
  excludeRead?: boolean;
  excludeArchived?: boolean;
}

export interface ChatMember {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  admin?: boolean;
  bot?: boolean;
}

/**
 * Telegram peer categories the chat-info pane distinguishes. The backend also
 * resolves "saved" (Saved Messages) instead of leaving it as a plain private
 * chat, because the info header and composer differ.
 */
export type ChatProfileType = "user" | "bot" | "saved" | "group" | "channel";

export interface BotCommandInfo {
  command: string;
  description?: string;
}

export interface BotMenuButtonInfo {
  type: "default" | "commands" | "webapp";
  text?: string;
  url?: string;
}

/** Full peer profile used by the chat-info pane and the composer. */
export interface ChatProfile {
  type: ChatProfileType;
  about?: string;
  username?: string;
  phone?: string;
  members: number;
  canViewMembers: boolean;
  /** Whether the current account may post in this chat. */
  canSend: boolean;
  /** Whether text messages are allowed (rights, independent of slow mode). */
  canSendPlain: boolean;
  /** Machine reason when canSend is false ("restricted", "broadcast", ...). */
  sendRestriction?: string;
  slowModeSeconds?: number;
  /** Unix seconds when the next message becomes sendable (slow mode). */
  slowModeNextSendDate?: number;
  isAdmin?: boolean;
  isOwner?: boolean;
  isForum?: boolean;
  inviteLink?: string;
  linkedChatId?: string;
  /** Full linked discussion chat entity, even when it is not in the dialog list. */
  linkedChat?: Chat;
  online?: boolean;
  lastSeen?: number;
  status?: UserStatusKind;
  botCommands?: BotCommandInfo[];
  botMenuButton?: BotMenuButtonInfo;
  botOwnerId?: string;
  botPrivacyUrl?: string;
  /** All public usernames of a channel/group (preferred one first). */
  usernames?: string[];
  /** Whether the current account may send stickers/GIFs in this chat. */
  canSendStickers?: boolean;
  canSendGifs?: boolean;
  /** Channel gift counter when the server exposes one. */
  giftsCount?: number;
  /** Channel admin count when the server exposes one. */
  adminsCount?: number;
  /** Total message count (Saved Messages only, best effort). */
  messagesCount?: number;
}

/** Result of pressing an inline-keyboard callback button. */
export interface BotCallbackResult {
  alert?: string;
  url?: string;
  message?: Message;
  cacheTime?: number;
}

/** A request to open a bot Web App in the detached mini-app window. */
export interface BotWebViewRequest {
  chatId: string;
  /** Opaque peer id of the bot that owns the button/menu. */
  botId: string;
  /** Message the button belongs to; 0 for the bot menu button. */
  messageId: number;
  /** Raw URL from the button or bot menu (may be empty). */
  url: string;
  fromBotMenu: boolean;
  /** Window title / button label. */
  title: string;
  /** Simple webview buttons open the raw URL without messages.requestWebView. */
  simple?: boolean;
}

/** In-app mini app overlay: one opened bot Web App. */
export interface MiniAppLaunch {
  url: string;
  title: string;
  botName?: string;
  avatarUrl?: string;
  fromBotMenu?: boolean;
  /** Backend routing data used by the Telegram JS bridge. */
  chatId?: string;
  botId?: string;
  messageId?: number;
  queryId?: number;
  /** Network params the bridge needs for prolong/data-send RPC calls. */
  network?: { proxy: string; ntp: string };
}

/** One star gift shown in a profile's Gifts tab. */
export interface GiftInfo {
  id: string;
  title: string;
  from?: string;
  date?: number;
  stars?: number;
  count?: number;
  thumbUrl?: string;
  unique?: boolean;
  soldOut?: boolean;
}

export interface ChatGiftsPage {
  gifts: GiftInfo[];
  nextOffset?: string;
  total?: number;
}

export type StickerDocKind = "static" | "tgs" | "webm";

/** One sticker document as exposed by the kernel sticker picker API. */
export interface StickerDoc {
  ref: string;
  id: string;
  kind: StickerDocKind;
  emoji?: string;
  setId?: string;
  thumbUrl?: string;
  streamUrl?: string;
  photoUrl?: string;
  w?: number;
  h?: number;
  sizeBytes?: number;
}

/** Installed or archived sticker set summary. */
export interface StickerSetInfo {
  ref: string;
  id: string;
  title: string;
  shortName?: string;
  count: number;
  official?: boolean;
  archived?: boolean;
  /** Whether this set is currently installed on the account. */
  installed?: boolean;
  coverUrl?: string;
  coverKind?: StickerDocKind;
}

export interface StickerPacks {
  recent: StickerDoc[];
  sets: StickerSetInfo[];
}

export interface StickerSetDetail {
  set: StickerSetInfo;
  stickers: StickerDoc[];
}

/** One saved GIF from Telegram's saved-GIF list. */
export interface SavedGif {
  ref: string;
  id: string;
  /** Inline-bot result id for GIF search results (not for saved GIFs). */
  resultId?: string;
  thumbUrl?: string;
  streamUrl: string;
  mime?: string;
  w?: number;
  h?: number;
  duration?: number;
  sizeBytes?: number;
}

/** Result of a sticker search (documents + matching set info). */
export interface StickerSearch {
  stickers: StickerDoc[];
  sets: StickerSetInfo[];
}

/** One page of inline-bot GIF search results. */
export interface GifSearchPage {
  gifs: SavedGif[];
  nextOffset?: string;
  queryId: number;
}

/** Result of resolving a t.me / tg:// link for in-app navigation. */
export interface ResolvedTelegramLink {
  kind: "chat" | "invite" | "unsupported";
  url: string;
  chat?: Chat;
  messageId?: number;
  inviteHash?: string;
  inviteTitle?: string;
  inviteMembers?: number;
  alreadyMember?: boolean;
}


/** Tabs of a chat-info shared media list, mirroring Telegram Web. */
export type SharedMediaSection =
  | "media"
  | "photos"
  | "videos"
  | "files"
  | "links"
  | "music"
  | "voice"
  | "gifs";

export interface ChatInfoSectionCount {
  section: SharedMediaSection;
  count: number;
}

/** Which chat-info tabs a peer actually has, resolved server-side. */
export interface ChatInfo {
  members: number;
  canViewMembers: boolean;
  /** False when Telegram refused the counter request; tabs load lazily. */
  countsKnown: boolean;
  counts: ChatInfoSectionCount[];
}

export interface SharedMediaPage {
  items: Message[];
  hasMore: boolean;
  nextBeforeId: number;
}

export interface ChatMembersPage {
  members: ChatMember[];
  nextOffset: number;
  total: number;
}

export type MediaKind =
  | "photo"
  | "video"
  | "file"
  | "audio"
  | "voice"
  | "video_note"
  | "sticker"
  | "animation"
  | "poll"
  | "location"
  | "venue"
  | "contact"
  | "webpage"
  | "dice"
  | "game"
  | "invoice"
  | "story"
  | "giveaway"
  | "paid"
  | "checklist"
  | "unsupported";

export interface MessageMedia {
  kind: MediaKind;
  name: string;
  thumbUrl?: string;
  photoUrl?: string;
  streamUrl?: string;
  size?: string;
  ext?: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mime?: string;
  title?: string;
  performer?: string;
  waveform?: number[];
  options?: string[];
  voteCounts?: number[];
  chosen?: boolean[];
  totalVoters?: number;
  pollClosed?: boolean;
  quiz?: boolean;
  correctOption?: number;
  explanation?: string;
  multipleChoice?: boolean;
  publicVoters?: boolean;
  latitude?: number;
  longitude?: number;
  live?: boolean;
  phone?: string;
  contactName?: string;
  url?: string;
  siteName?: string;
  description?: string;
  emoji?: string;
  value?: number;
  color?: string;
  checklist?: { text: string; done: boolean }[];
  amount?: number;
  currency?: string;
  quantity?: number;
  months?: number;
  untilDate?: number;
  paidCount?: number;
  storyId?: number;
  spoiler?: boolean;
  round?: boolean;
  externalId?: string;
}

export interface MessageEntity {
  type:
    | "bold"
    | "italic"
    | "underline"
    | "strike"
    | "code"
    | "pre"
    | "link"
    | "url"
    | "mention"
    | "hashtag"
    | "cashtag"
    | "bot_command"
    | "email"
    | "phone"
    | "spoiler"
    | "blockquote"
    | "text_mention"
    | "custom_emoji";
  offset: number;
  length: number;
  url?: string;
  language?: string;
  userId?: string;
}

export interface MessageButton {
  text: string;
  url?: string;
  data?: string;
  kind?: "url" | "callback" | "webview" | "webview_simple" | "copy";
  /** 0-based inline-keyboard row; Telegram renders one flex row per value. */
  row?: number;
  /** Telegram button style: primary (blue), danger (red), success (green). */
  style?: "primary" | "danger" | "success";
}

export interface Reaction {
  emoji: string;
  count: number;
  chosen?: boolean;
  customEmojiId?: string;
  url?: string;
}

export interface Message {
  id: number;
  chatId: string;
  out: boolean;
  sender?: string;
  senderId?: string;
  senderAvatarUrl?: string;
  senderEmojiStatusUrl?: string;
  text?: string;
  time: string;
  date: string;
  checks?: "sent" | "read";
  forwarded?: boolean;
  forwardedFrom?: string;
  forwardedDate?: number;
  replyToId?: number;
  replyToText?: string;
  service?: string;
  serviceKind?: string;
  serviceActor?: string;
  serviceValue?: string;
  groupedId?: string;
  reactions?: Reaction[];
  media?: MessageMedia;
  entities?: MessageEntity[];
  buttons?: MessageButton[];
  pinned?: boolean;
  postAuthor?: string;
  views?: number;
  forwards?: number;
  editDate?: number;
  ttl?: number;
  noForwards?: boolean;
  via?: string;
  tail?: boolean;
}

export interface ChatEvent {
  kind:
    | "message"
    | "edit"
    | "delete"
    | "reaction"
    | "resync"
    | "read"
    | "readOutbox"
    | "presence"
    | "pinned";
  chatId?: string;
  message?: unknown;
  messageIds?: number[] | null;
  messageId?: number;
  reactions?: Reaction[] | null;
  unread?: number;
  maxId?: number;
  /** presence events */
  userId?: number;
  online?: boolean;
  lastSeen?: number;
  status?: UserStatusKind;
}

export interface UploadEvent {
  id: string;
  chatId: string;
  name: string;
  uploaded: number;
  total: number;
  progress: number;
  done?: boolean;
  failed?: boolean;
  error?: string;
}

export interface UploadProgress {
  id: string;
  name: string;
  progress: number;
  done?: boolean;
  failed?: boolean;
  error?: string;
}

export type TaskStatus = "active" | "queued" | "paused" | "done" | "failed";

export interface DownloadTask {
  id: string;
  name: string;
  chat: string;
  chatId: string;
  messageId: number;
  mediaKind?: string;
  size: string;
  progress: number;
  speed?: string;
  eta?: string;
  status: TaskStatus;
  ext: string;
  color: string;
  error?: string;
  path?: string;
}

export interface DownloadEvent {
  task?: DownloadTask;
  removed?: boolean;
}
