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
  verified?: boolean;
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
}

export interface KernelMessage {
  id: number;
  chatId: string;
  out: boolean;
  sender?: string;
  text?: string;
  date: number;
  checks?: string;
  forwarded?: boolean;
  forwardedFrom?: string;
  forwardedDate?: number;
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
    case "Contact":
      return t("media.contact");
    case "Poll":
      return t("media.poll");
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
    verified: chat.verified,
    members: chat.members ? t("chat.members", { count: chat.members }) : undefined,
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
  return kind === "photo" || kind === "video" || kind === "audio" ? kind : "file";
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
    text: message.text || undefined,
    time: formatMessageTime(date, language),
    date: formatMessageDate(date, language, t, now),
    checks:
      message.checks === "read" ? "read" : message.out ? "sent" : undefined,
    forwarded: Boolean(message.forwarded),
    forwardedFrom: message.forwardedFrom || undefined,
    forwardedDate: message.forwardedDate || undefined,
    media: mapMedia(message.media, t),
    tail: true,
  };
}
