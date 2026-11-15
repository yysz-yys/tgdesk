/**
 * Top peers for the third empty-chat tip card ("Chats"), its Popular filter.
 *
 * The kernel's `GetTopPeers` wraps `contacts.getTopPeers{correspondents:true}` —
 * the same call Telegram Web K makes and caches for a day in account state. The
 * frontend keeps the same 24h cache so the card (which unmounts whenever a chat
 * is open) does not even pay the Wails round-trip on every return to the empty
 * column, and dedupes concurrent mounts through one in-flight promise.
 *
 * The generated Wails bindings under `frontend/bindings/**` do not include
 * `GetTopPeers` until the Lead regenerates them after the kernel method lands;
 * the service namespace is therefore cast through a *local*, structurally typed
 * interface. Once the bindings exist this file needs no change — the cast is
 * compile-time only.
 *
 * A failed call (`FLOOD_WAIT`, network, kernel without a ranking) resolves to an
 * empty list rather than throwing: the card then hides the Popular filter, which
 * is exactly the state of the reference screenshot.
 */
import { Service as AppService } from "../../bindings/tgdesk/internal/app";
import type { KernelChat } from "../data/telegram";

/** The local shape of the binding method (see `stickerApi.ts` for the pattern). */
export interface TopPeersBindings {
  GetTopPeers(
    proxy: string,
    ntp: string,
    limit: number,
  ): Promise<KernelChat[] | null>;
}

const bindings = AppService as unknown as TopPeersBindings;

/** Web K caches the ranking in account state for a day (`cachedTime + 86400e3`). */
const CACHE_TTL_MS = 86_400_000;

/** The card's 4×2 grid; Web K asks the manager for 8 rows (`PEERS_LIMIT`). */
export const TOP_PEERS_LIMIT = 8;

interface CacheEntry {
  at: number;
  peers: KernelChat[];
}

let cache: CacheEntry | null = null;
let pending: Promise<KernelChat[]> | null = null;

/**
 * Returns up to `limit` most-used correspondents (newest ranking first), or an
 * empty list when the kernel has none / the call failed.
 */
export function fetchTopPeers(
  proxy: string,
  ntp: string,
  limit = TOP_PEERS_LIMIT,
): Promise<KernelChat[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return Promise.resolve(cache.peers);
  }
  if (pending) {
    return pending;
  }
  if (typeof bindings.GetTopPeers !== "function") {
    // Older bindings (before regeneration) — treat as "no ranking".
    return Promise.resolve([]);
  }
  pending = bindings
    .GetTopPeers(proxy, ntp, limit)
    .then((peers) => {
      const list = Array.isArray(peers) ? peers : [];
      cache = { at: Date.now(), peers: list };
      return list;
    })
    .catch(() => [] as KernelChat[])
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Drops the cache (dev preview / tests; the app never needs it). */
export function resetTopPeersCache() {
  cache = null;
  pending = null;
}
