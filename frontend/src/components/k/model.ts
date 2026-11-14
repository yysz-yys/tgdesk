import type { Chat, ChatFolder } from "../../types";
import { chatMatchesFolder } from "../../data/folders";

/** tweb's peer-colour order (`DialogColors` in getPeerColorById.ts). */
export const PEER_COLOR_NAMES = [
  "red",
  "orange",
  "violet",
  "green",
  "cyan",
  "blue",
  "pink",
] as const;

export type PeerColorName = (typeof PEER_COLOR_NAMES)[number];

/**
 * Web K numbers its avatar palette by the raw peer id: `abs(id) % 7`
 * (`getPeerColorIndexById`). Our chat ids are the opaque `kind:id:hash` string,
 * so take the numeric part.
 */
export function peerColorIndex(chat: Chat): number {
  if (typeof chat.colorIndex === "number" && chat.colorIndex >= 0) {
    return chat.colorIndex % PEER_COLOR_NAMES.length;
  }
  const numeric = chat.id.split(":")[1];
  const id = Number(numeric);
  if (!Number.isFinite(id)) {
    return 0;
  }
  return Math.abs(Math.trunc(id)) % PEER_COLOR_NAMES.length;
}

export function peerColorName(chat: Chat): PeerColorName {
  return PEER_COLOR_NAMES[peerColorIndex(chat)];
}

function firstGlyph(value: string) {
  return Array.from(value)[0] ?? "";
}

/**
 * tweb's `getAbbreviation`: first glyph of the first word, plus the first glyph
 * of the last word when the title has more than one.
 */
export function chatAbbreviation(title: string): string {
  const parts = (title || "").trim().split(" ");
  if (!parts[0]) return "";
  const first = firstGlyph(parts[0]);
  if (parts.length === 1) return first;
  return first + firstGlyph(parts[parts.length - 1]);
}

export function formatBadgeCount(count: number): string {
  if (count > 999) return "999+";
  return String(count);
}

/**
 * Web K's folder chips count unread *chats* (`unreadCount`, the size of the
 * folder's unread-peer set — stores/folders.ts:19-30), and a chip goes grey when
 * every unread chat in it is muted.
 */
export function folderUnread(
  folder: ChatFolder,
  chats: Chat[],
): { count: number; muted: boolean } {
  let count = 0;
  let unmuted = 0;
  for (const chat of chats) {
    // Archived chats belong to a folder unless it excludes them
    // (dialogFilter.exclude_archived); tweb counts them in the chip badge too.
    if (chat.archived && folder.excludeArchived) continue;
    if (!chatMatchesFolder(folder, chat)) continue;
    if (!chat.unread) continue;
    count += 1;
    if (!chat.muted) unmuted += 1;
  }
  return { count, muted: count > 0 && unmuted === 0 };
}

/** The "All" chip counts unmuted unread chats (tweb stores/folders.ts:27). */
export function totalUnread(chats: Chat[]): { count: number; muted: boolean } {
  let count = 0;
  for (const chat of chats) {
    if (chat.archived || !chat.unread || chat.muted) continue;
    count += 1;
  }
  return { count, muted: false };
}

export interface ArchivePreviewItem {
  title: string;
  unread: boolean;
}

/**
 * The archive row's preview: up to ten archived chats, newest first (tweb sorts
 * the archived dialogs by their dialog index), each title cut to 20 symbols.
 * Unread entries are drawn in the bold "unread" shade (archiveDialog.tsx
 * `unreadPeerTitle`, `limitSymbols = 20`).
 */
export function archivePreview(chats: Chat[]): ArchivePreviewItem[] {
  return [...chats]
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
    .slice(0, 10)
    .map((chat) => ({
      title: Array.from(chat.title).slice(0, 20).join(""),
      unread: (chat.unread ?? 0) > 0,
    }));
}

/**
 * The archive badge counts unread *chats*, not messages: tweb's
 * getFolderUnreadCount returns folder.unreadPeerIds.size (dialogs.ts:646-677).
 */
export function archivedUnread(chats: Chat[]): number {
  return chats.reduce(
    (total, chat) => (chat.archived && (chat.unread ?? 0) > 0 ? total + 1 : total),
    0,
  );
}

/** How Web K labels an auto-delete period on the avatar corner: "1d", "12h", … */
export function autoDeleteLabel(seconds?: number): string | null {
  if (!seconds) return null;
  const day = 86_400;
  if (seconds >= day) {
    const days = Math.round(seconds / day);
    return `${days}d`;
  }
  const hours = Math.round(seconds / 3600);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}
