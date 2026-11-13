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
  online?: boolean;
  verified?: boolean;
  members?: string;
  memberCount?: number;
  color: string;
  initials: string;
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
  kind?: "url" | "callback" | "webview" | "copy";
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
  kind: "message" | "edit" | "delete" | "reaction" | "resync" | "read" | "readOutbox";
  chatId?: string;
  message?: unknown;
  messageIds?: number[] | null;
  messageId?: number;
  reactions?: Reaction[] | null;
  unread?: number;
  maxId?: number;
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
