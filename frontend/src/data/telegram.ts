import type { TFunction } from "i18next";
import type { Chat, ChatKind, Message, MessageMedia, MediaKind } from "../types";

export interface KernelChat {
  id: string;
  title: string;
  kind: string;
  username?: string;
  preview: string;
  lastMessageDate?: number;
  unread?: number;
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
  verified?: boolean;
  bot?: boolean;
  contact?: boolean;
  members?: number;
}

export interface KernelMessageMedia {
  kind: string;
  name: string;
  size?: string;
  ext?: string;
  color?: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mime?: string;
  options?: string[] | null;
  voteCounts?: number[] | null;
  chosen?: boolean[] | null;
  totalVoters?: number;
  pollClosed?: boolean;
  quiz?: boolean;
  latitude?: number;
  longitude?: number;
  live?: boolean;
  phone?: string;
  contactName?: string;
  url?: string;
  siteName?: string;
  title?: string;
  description?: string;
  emoji?: string;
  value?: number;
}

export interface KernelMessage {
  id: number;
  chatId: string;
  out: boolean;
  sender?: string;
  senderId?: string;
  text?: string;
  date: number;
  checks?: string;
  forwarded?: boolean;
  forwardedFrom?: string;
  forwardedDate?: number;
  replyToId?: number;
  replyToText?: string;
  service?: string;
  serviceKind?: string;
  serviceActor?: string;
  serviceValue?: string;
  media?: KernelMessageMedia | null;
}

const AVATAR_COLORS = [
  "#65aadd",
  "#8774e1",
  "#4fae4e",
  "#f08a3c",
  "#e05a8a",
  "#5fb3a1",
  "#6ec9cb",
  "#ee7aae",
];

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function chatColor(id: string) {
  return AVATAR_COLORS[hashString(id) % AVATAR_COLORS.length];
}

export function chatInitials(title: string) {
  const parts = title
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "T";
  }
  const first = Array.from(parts[0])[0] ?? "";
  const second = parts.length > 1 ? (Array.from(parts[1])[0] ?? "") : "";
  return `${first}${second}`.toUpperCase() || "T";
}

function normalizedKind(kind: string): ChatKind {
  return kind === "private" || kind === "channel" ? kind : "group";
}

export function formatChatTime(date: Date, language: string, now = new Date()) {
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat(language, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  if (days > 0 && days < 7) {
    return new Intl.DateTimeFormat(language, { weekday: "short" }).format(date);
  }

  return new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function localizedPreview(preview: string, t: TFunction) {
  switch (preview) {
    case "Photo":
      return t("media.photo");
    case "File":
      return t("media.file");
    case "Location":
      return t("media.location");
    case "Live location":
      return t("media.liveLocation");
    case "Contact":
      return t("media.contact");
    case "Poll":
      return t("media.poll");
    case "Sticker":
      return t("media.sticker");
    case "GIF":
      return t("media.gif");
    case "Voice message":
      return t("media.voice");
    case "Video message":
      return t("media.videoNote");
    case "Audio":
      return t("media.audio");
    case "Video":
      return t("media.video");
    case "Story":
      return t("media.story");
    case "Giveaway":
    case "Giveaway results":
      return t("media.giveaway");
    case "Paid media":
      return t("media.paid");
    case "Checklist":
      return t("media.checklist");
    case "Unsupported message":
      return t("media.unsupported");
    case "Service message":
      return t("media.service");
    default:
      return preview;
  }
}

export function mapChat(chat: KernelChat, language: string, t: TFunction): Chat {
  const date = chat.lastMessageDate
    ? new Date(chat.lastMessageDate * 1000)
    : null;
  return {
    id: chat.id,
    title: chat.title || "Telegram",
    kind: normalizedKind(chat.kind),
    username: chat.username || undefined,
    preview: localizedPreview(chat.preview || "", t),
    time: date ? formatChatTime(date, language) : "",
    unread: chat.unread || undefined,
    pinned: chat.pinned,
    muted: chat.muted,
    archived: chat.archived,
    bot: chat.bot,
    contact: chat.contact,
    verified: chat.verified,
    members: chat.members ? t("chat.members", { count: chat.members }) : undefined,
    memberCount: chat.members || undefined,
    online: false,
    color: chatColor(chat.id),
    initials: chatInitials(chat.title),
  };
}

function formatMessageTime(date: Date, language: string) {
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMessageDate(date: Date, language: string, t: TFunction, now = new Date()) {
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return t("time.today");
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  if (days === 1) {
    return t("time.yesterday");
  }

  return new Intl.DateTimeFormat(language, {
    month: "long",
    day: "numeric",
  }).format(date);
}

function normalizedMediaKind(kind: string): MediaKind {
  switch (kind) {
    case "photo":
    case "video":
    case "file":
    case "audio":
    case "voice":
    case "video_note":
    case "sticker":
    case "animation":
    case "poll":
    case "location":
    case "venue":
    case "contact":
    case "webpage":
    case "dice":
    case "game":
    case "invoice":
    case "story":
    case "giveaway":
    case "paid":
    case "checklist":
      return kind;
    default:
      return "unsupported";
  }
}

function localizedService(message: KernelMessage, t: TFunction): string | undefined {
  const actor = message.serviceActor || "";
  switch (message.serviceKind) {
    case "join":
      return actor
        ? t("service.join", { name: actor })
        : t("service.joinUnknown");
    case "invite":
      return actor
        ? t("service.invite", { name: actor })
        : t("service.inviteUnknown");
    case "leave":
      return actor
        ? t("service.leave", { name: actor })
        : t("service.leaveUnknown");
    case "title":
      return t("service.title", { title: message.serviceValue || "" });
    case "pin":
      return t("service.pin");
    case "channelCreated":
      return t("service.channelCreated");
    case "groupCreated":
      return t("service.groupCreated");
    case "ttl": {
      const seconds = Number(message.serviceValue || 0);
      if (!seconds) {
        return t("service.ttlDisabled");
      }
      if (seconds % 86400 === 0) {
        return t("service.ttlDays", { count: seconds / 86400 });
      }
      if (seconds % 3600 === 0) {
        return t("service.ttlHours", { count: seconds / 3600 });
      }
      if (seconds % 60 === 0) {
        return t("service.ttlMinutes", { count: seconds / 60 });
      }
      return t("service.ttlSeconds", { count: seconds });
    }
    default:
      return message.service || undefined;
  }
}

function mapMedia(
  media: KernelMessageMedia | null | undefined,
  t: TFunction,
): MessageMedia | undefined {
  if (!media) {
    return undefined;
  }
  return {
    kind: normalizedMediaKind(media.kind),
    name: localizedPreview(media.name || "File", t),
    size: media.size || undefined,
    ext: media.ext || undefined,
    duration: media.duration || undefined,
    width: media.width || undefined,
    height: media.height || undefined,
    sizeBytes: media.sizeBytes || undefined,
    mime: media.mime || undefined,
    options: media.options || undefined,
    voteCounts: media.voteCounts || undefined,
    chosen: media.chosen || undefined,
    totalVoters: media.totalVoters || undefined,
    pollClosed: media.pollClosed || undefined,
    quiz: media.quiz || undefined,
    latitude: media.latitude || undefined,
    longitude: media.longitude || undefined,
    live: media.live || undefined,
    phone: media.phone || undefined,
    contactName: media.contactName || undefined,
    url: media.url || undefined,
    siteName: media.siteName || undefined,
    title: media.title || undefined,
    description: media.description || undefined,
    emoji: media.emoji || undefined,
    value: media.value || undefined,
    color: media.color || undefined,
  };
}

export function mapMessage(
  message: KernelMessage,
  language: string,
  t: TFunction,
  now = new Date(),
): Message {
  const date = new Date(message.date * 1000);
  return {
    id: message.id,
    chatId: message.chatId,
    out: message.out,
    sender: message.sender || undefined,
    senderId: message.senderId || undefined,
    text: message.text || undefined,
    time: formatMessageTime(date, language),
    date: formatMessageDate(date, language, t, now),
    checks:
      message.checks === "read" ? "read" : message.out ? "sent" : undefined,
    forwarded: Boolean(message.forwarded),
    forwardedFrom: message.forwardedFrom || undefined,
    forwardedDate: message.forwardedDate || undefined,
    replyToId: message.replyToId || undefined,
    replyToText: message.replyToText || undefined,
    service: localizedService(message, t),
    serviceKind: message.serviceKind || undefined,
    serviceActor: message.serviceActor || undefined,
    serviceValue: message.serviceValue || undefined,
    media: mapMedia(message.media, t),
    tail: true,
  };
}
