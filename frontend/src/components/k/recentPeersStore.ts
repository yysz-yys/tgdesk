/**
 * The Chats tip card's "Searched" and "Closed" peer lists.
 *
 * Telegram Web K keeps both in account state (`appState.recentSearch` /
 * `appState.recentlyClosedChats`): the peers a search result was opened for,
 * and the peer that was open when the user closed/left a chat or switched away
 * from it. tgdesk has no account-state store, so they live in localStorage here
 * and are shared through `useSyncExternalStore` (the pattern of `tipsStore.ts`).
 *
 * Entries are snapshots of the visible fields (id, title, kind, colour, bot),
 * never the avatar URL: those are loopback, session-scoped URLs that die with
 * the process. The card merges an entry with the live `Chat` of the same id at
 * render time (live wins) and falls back to the snapshot for peers that are no
 * longer in the dialog list, exactly like Web K renders peers that are gone
 * from the list from its cached peer data.
 */
import { useSyncExternalStore } from "react";
import type { Chat } from "../../types";

/** One remembered peer. */
export interface RecentPeer {
  id: string;
  title: string;
  kind: Chat["kind"];
  /** Web K avatar gradient index (abs(raw peer id) % 7), for the letter avatar. */
  colorIndex?: number;
  bot?: boolean;
}

/** Web K's `RECENT_PEERS_LIMIT`: both lists keep the last 20 peers. */
export const RECENT_PEERS_LIMIT = 20;

const SEARCH_KEY = "tgdesk.k.recentSearch.v1";
const CLOSED_KEY = "tgdesk.k.recentlyClosed.v1";

type ListName = "search" | "closed";

interface RecentPeersState {
  search: RecentPeer[];
  closed: RecentPeer[];
}

const LIST_KEYS: Record<ListName, string> = {
  search: SEARCH_KEY,
  closed: CLOSED_KEY,
};

function isChatKind(value: unknown): value is Chat["kind"] {
  return value === "private" || value === "group" || value === "channel";
}

function isRecentPeer(value: unknown): value is RecentPeer {
  if (!value || typeof value !== "object") return false;
  const peer = value as Record<string, unknown>;
  return (
    typeof peer.id === "string" &&
    peer.id.length > 0 &&
    typeof peer.title === "string" &&
    isChatKind(peer.kind)
  );
}

function sanitize(peers: unknown): RecentPeer[] {
  if (!Array.isArray(peers)) return [];
  return peers.filter(isRecentPeer).slice(0, RECENT_PEERS_LIMIT);
}

function readList(name: ListName): RecentPeer[] {
  try {
    const raw = localStorage.getItem(LIST_KEYS[name]);
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    // Private mode / corrupt value: an empty list costs only the card's filter.
    return [];
  }
}

let state: RecentPeersState = {
  search: readList("search"),
  closed: readList("closed"),
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist(name: ListName) {
  try {
    localStorage.setItem(LIST_KEYS[name], JSON.stringify(state[name]));
  } catch {
    // Only costs the next launch's list.
  }
}

function setList(name: ListName, peers: RecentPeer[]) {
  state = { ...state, [name]: peers };
  persist(name);
  emit();
}

/** Snapshot of the fields a tile paints. Avatar URLs stay out (session URLs). */
function snapshot(chat: Chat): RecentPeer {
  return {
    id: chat.id,
    title: chat.title,
    kind: chat.kind,
    colorIndex:
      typeof chat.colorIndex === "number" ? chat.colorIndex : undefined,
    bot: chat.bot || undefined,
  };
}

/** tweb `pushRecentPeer`: no-op when already first, else unshift + de-dupe + cap. */
function pushRecentPeer(name: ListName, chat: Chat) {
  const list = state[name];
  if (list[0]?.id === chat.id) return;
  const next = [
    snapshot(chat),
    ...list.filter((entry) => entry.id !== chat.id),
  ].slice(0, RECENT_PEERS_LIMIT);
  setList(name, next);
}

/** A peer opened from the chat-list search results (the card's "Searched"). */
export function pushRecentSearch(chat: Chat) {
  pushRecentPeer("search", chat);
}

/** The chat that was open when the user closed it or switched away ("Closed"). */
export function pushRecentlyClosed(chat: Chat) {
  pushRecentPeer("closed", chat);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSearch(): RecentPeer[] {
  return state.search;
}

function readClosed(): RecentPeer[] {
  return state.closed;
}

export function useRecentSearch(): RecentPeer[] {
  return useSyncExternalStore(subscribe, readSearch, readSearch);
}

export function useRecentlyClosed(): RecentPeer[] {
  return useSyncExternalStore(subscribe, readClosed, readClosed);
}

/**
 * Dev preview only: replaces both lists at once so the harness can reproduce a
 * known card state (`?tipsData=searched|closed|empty|…`). The app records the
 * lists through the two push functions above.
 */
export function seedRecentPeers(seed: {
  search?: RecentPeer[];
  closed?: RecentPeer[];
}) {
  const search = sanitize(seed.search);
  const closed = sanitize(seed.closed);
  state = { search, closed };
  persist("search");
  persist("closed");
  emit();
}
