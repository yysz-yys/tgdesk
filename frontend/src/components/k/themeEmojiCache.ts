/**
 * Data sources for the Appearance tiles' animated-emoji figures.
 *
 * The figures are TGS files (gzipped Lottie JSON) from Telegram's animated-emoji
 * set. Most of them ship with the app (see `themeEmojiAssets.ts`), so a tile gets
 * its artwork and click animation immediately — even on the very first launch,
 * and in the dev preview. For an emoticon that is not bundled (a theme Telegram
 * adds later) the kernel's loopback URL is used instead, and its decoded JSON is
 * cached in IndexedDB: the URL's last segment is the sticker ref id, a hash of
 * the document location that stays the same across launches, so such a figure
 * downloads once and is read back locally from then on.
 *
 * Everything degrades gracefully: without IndexedDB (private mode, old engine)
 * the kernel URL is fetched each launch as before.
 */
import { bundledThemeEmoji } from "./themeEmojiAssets";

const DB_NAME = "tgdesk.k.themeEmoji";
const DB_STORE = "lottie";
const DB_VERSION = 1;
const REF_MAP_KEY = "tgdesk.k.themeEmojiRefs.v1";

const memory = new Map<string, Promise<unknown>>();

/** The stable sticker ref id at the end of a kernel animated-emoji URL. */
export function emojiRefId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const path = url.split(/[?#]/, 1)[0];
  const ref = path.split("/").filter(Boolean).pop();
  return ref || undefined;
}

function canUseIndexedDb() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(DB_STORE)) {
            database.createObjectStore(DB_STORE);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function readItem(ref: string): Promise<unknown | undefined> {
  return openDatabase().then(
    (database) =>
      new Promise((resolve) => {
        if (!database) {
          resolve(undefined);
          return;
        }
        try {
          const transaction = database.transaction(DB_STORE, "readonly");
          const request = transaction.objectStore(DB_STORE).get(ref);
          request.onsuccess = () =>
            resolve(request.result === undefined ? undefined : request.result);
          request.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

function writeItem(ref: string, data: unknown) {
  void openDatabase().then((database) => {
    if (!database) return;
    try {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(data, ref);
    } catch {
      // A cache miss next launch is the only cost.
    }
  });
}

/** TGS bytes (gzip-compressed Lottie JSON) to the parsed animation data. */
async function decodeTgs(buffer: ArrayBuffer): Promise<unknown> {
  const bytes = new Uint8Array(buffer);
  const gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = gzipped
    ? await new Response(
        new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).text()
    : await new Response(buffer).text();
  return JSON.parse(text) as unknown;
}

function remember(key: string, load: () => Promise<unknown>): Promise<unknown> {
  const existing = memory.get(key);
  if (existing) return existing;
  const task = load();
  memory.set(key, task);
  task.catch(() => memory.delete(key));
  return task;
}

/** The bundled figure for an emoticon, if one ships with the app. */
function loadBundled(emoticon: string): Promise<unknown> | undefined {
  const url = bundledThemeEmoji(emoticon);
  if (!url) return undefined;
  return remember(`bundled:${url}`, async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`bundled animated emoji ${response.status}`);
    }
    return decodeTgs(await response.arrayBuffer());
  });
}

/** The figure from the kernel URL (or its IndexedDB copy when offline/before
 * the URL arrives — the ref id is enough to look it up). */
function loadRemote(
  url: string | undefined,
  cachedRef: string | undefined,
): Promise<unknown> {
  const ref = emojiRefId(url) ?? cachedRef;
  if (!ref) return Promise.reject(new Error("no animated-emoji ref"));
  return remember(`ref:${ref}`, async () => {
    const stored = await readItem(ref);
    if (stored !== undefined) return stored;
    if (!url) throw new Error("no animated-emoji URL");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`animated emoji ${response.status}`);
    }
    const data: unknown = await response.json();
    writeItem(ref, data);
    return data;
  });
}

/**
 * The Lottie data for one tile figure. The bundled file wins because it is
 * local and immediate; otherwise the kernel URL / its cached copy is used.
 */
export function loadThemeEmoji(
  emoticon: string,
  url?: string,
  cachedRef?: string,
): Promise<unknown> {
  return loadBundled(emoticon) ?? loadRemote(url, cachedRef);
}

/** Warms the bundled figures in the background, a few at a time. */
export function preloadThemeEmoji(emoticons: string[], limit = 4) {
  const unique = Array.from(new Set(emoticons.filter(Boolean)));
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const emoticon = unique[next++];
      await loadThemeEmoji(emoticon).catch(() => undefined);
    }
  };
  const workers = Math.min(Math.max(1, limit), unique.length);
  return Promise.all(Array.from({ length: workers }, worker)).then(() => undefined);
}

/** Remembers which sticker each emoticon resolved to, across launches. */
export function readCachedEmojiRefs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(REF_MAP_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, string> = {};
    for (const [emoticon, ref] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ref === "string" && ref) result[emoticon] = ref;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveCachedEmojiRefs(urls: Record<string, string>) {
  try {
    const refs = readCachedEmojiRefs();
    for (const [emoticon, url] of Object.entries(urls)) {
      const ref = emojiRefId(url);
      if (ref) refs[emoticon] = ref;
    }
    if (Object.keys(refs).length > 0) {
      localStorage.setItem(REF_MAP_KEY, JSON.stringify(refs));
    }
  } catch {
    // Only costs an early fetch on the next launch.
  }
}
