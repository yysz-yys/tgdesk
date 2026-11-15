import { useSyncExternalStore } from "react";
import type { ChatEvent, ChatKind } from "../types";

/**
 * Web K typing indicators (tweb `appProfileManager.onUpdateUserTyping` +
 * `appImManager` typings UI).
 *
 * The kernel forwards `chat:event` payloads with `kind: "typing"`; this module
 * keeps them per chat (one entry per user, 6 s expiry exactly like tweb's
 * `setTimeout(cancelAction, 6000)`), and gives components a store hook plus the
 * localized description. It is deliberately UI-framework-free below the React
 * hook so both the chat list and the chat header can read the same state.
 */

export type TypingAction =
  | "typing"
  | "cancel"
  | "upload_photo"
  | "upload_document"
  | "upload_video"
  | "record_voice"
  | "record_video"
  | "choose_sticker"
  | (string & {});

export interface TypingEntry {
  userId?: number;
  /** Display name the kernel resolved from the update entities (groups). */
  name?: string;
  action: TypingAction;
  expiresAt: number;
}

export interface TypingDescription {
  key: string;
  options?: Record<string, string | number>;
}

/** tweb's client-side expiry for one typing entry. */
export const TYPING_TIMEOUT_MS = 6000;

const EMPTY: TypingEntry[] = [];
const chats = new Map<string, Map<string, TypingEntry>>();
const snapshots = new Map<string, TypingEntry[]>();
const listeners = new Set<() => void>();
let expiryTimer: number | undefined;

function entryKey(userId?: number, name?: string): string {
  if (typeof userId === "number" && userId !== 0) {
    return `u:${userId}`;
  }
  const trimmed = name?.trim().toLowerCase();
  return trimmed ? `n:${trimmed}` : "anon";
}

function emit(): void {
  snapshots.clear();
  for (const listener of listeners) {
    listener();
  }
  scheduleExpiry();
}

function scheduleExpiry(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (expiryTimer !== undefined) {
    window.clearTimeout(expiryTimer);
    expiryTimer = undefined;
  }
  let next = Number.POSITIVE_INFINITY;
  for (const entries of chats.values()) {
    for (const entry of entries.values()) {
      if (entry.expiresAt < next) {
        next = entry.expiresAt;
      }
    }
  }
  if (!Number.isFinite(next)) {
    return;
  }
  expiryTimer = window.setTimeout(
    () => {
      expiryTimer = undefined;
      pruneExpired();
    },
    Math.max(0, next - Date.now()) + 30,
  );
}

function pruneExpired(): void {
  const now = Date.now();
  let changed = false;
  for (const [chatId, entries] of chats) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
        changed = true;
      }
    }
    if (entries.size === 0) {
      chats.delete(chatId);
    }
  }
  if (changed) {
    emit();
  }
}

/** Applies one typing entry; `cancel` removes it again. */
export function applyTyping(
  chatId: string,
  entry: { userId?: number; name?: string; action: TypingAction },
  timeoutMs = TYPING_TIMEOUT_MS,
): void {
  if (!chatId) {
    return;
  }
  if (entry.action === "cancel") {
    clearTyping(chatId, entry.userId, entry.name);
    return;
  }
  let entries = chats.get(chatId);
  if (!entries) {
    entries = new Map();
    chats.set(chatId, entries);
  }
  entries.set(entryKey(entry.userId, entry.name), {
    userId: entry.userId,
    name: entry.name?.trim() || undefined,
    action: entry.action,
    expiresAt: Date.now() + timeoutMs,
  });
  emit();
}

/** Routes a kernel `chat:event` payload; ignores non-typing events. */
export function applyTypingEvent(event: ChatEvent): void {
  if (event.kind !== "typing" || !event.chatId) {
    return;
  }
  const action = (event.typingAction || "typing") as TypingAction;
  if (action === "cancel") {
    clearTyping(
      event.chatId,
      event.typingUserId,
      event.typingName || undefined,
    );
    return;
  }
  applyTyping(event.chatId, {
    userId: event.typingUserId,
    name: event.typingName || undefined,
    action,
  });
}

/** Removes one user's entry, or every entry of the chat / all chats. */
export function clearTyping(
  chatId?: string,
  userId?: number,
  name?: string,
): void {
  if (!chatId) {
    if (chats.size === 0) {
      return;
    }
    chats.clear();
    emit();
    return;
  }
  const entries = chats.get(chatId);
  if (!entries) {
    return;
  }
  if (typeof userId === "number" || name) {
    entries.delete(entryKey(userId, name));
  } else {
    entries.clear();
  }
  if (entries.size === 0) {
    chats.delete(chatId);
  }
  emit();
}

/** Clears everything (logout / account switch). */
export function resetTyping(): void {
  clearTyping();
}

function snapshotFor(chatId: string | undefined): TypingEntry[] {
  if (!chatId) {
    return EMPTY;
  }
  const cached = snapshots.get(chatId);
  if (cached) {
    return cached;
  }
  const entries = chats.get(chatId);
  const list = entries && entries.size > 0 ? Array.from(entries.values()) : EMPTY;
  snapshots.set(chatId, list);
  return list;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The typing entries of one chat, newest update wins per user. */
export function getChatTyping(chatId: string | undefined): TypingEntry[] {
  return snapshotFor(chatId);
}

/** React hook: re-renders while the chat has typists / on each update. */
export function useChatTyping(chatId: string | undefined): TypingEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshotFor(chatId),
    () => EMPTY,
  );
}

/** Stable tweb wording data; `null` means "not typing". */
export function typingDescription(
  entries: TypingEntry[],
  kind: ChatKind,
  isBot = false,
): TypingDescription | null {
  if (entries.length === 0 || isBot) {
    return null;
  }
  if (kind === "channel") {
    return null;
  }
  if (kind === "private") {
    return { key: "chat.typingPrivate" };
  }
  const names = entries
    .map((entry) => entry.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (entries.length === 1) {
    return names[0]
      ? { key: "chat.typingGroup", options: { name: names[0] } }
      : { key: "chat.typingPrivate" };
  }
  if (entries.length === 2 && names.length === 2) {
    return { key: "chat.typingPair", options: { a: names[0], b: names[1] } };
  }
  return names[0]
    ? {
        key: "chat.typingMulti",
        options: { name: names[0], count: entries.length - 1 },
      }
    : { key: "chat.typingPrivate" };
}

/** Display name of the first typist (header subtitle fallbacks). */
export function firstTypistName(entries: TypingEntry[]): string | undefined {
  return entries.find((entry) => entry.name)?.name;
}
