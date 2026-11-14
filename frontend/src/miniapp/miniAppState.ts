import { Service as AppService } from "../../bindings/tgdesk/internal/app";

/** Session payload written by the Go mini-app window manager. */
export interface MiniAppState {
  url: string;
  title?: string;
  botName?: string;
  avatarUrl?: string;
}

/**
 * Fetches and caches the mini-app session payload
 * (`AppService.TakeMiniAppState`). The Go entry stays alive until the window
 * closes, but a per-session cache keeps React StrictMode's double effect (dev)
 * and HMR re-renders from refetching on every mount.
 */
const stateCache = new Map<string, Promise<string>>();

export function takeMiniAppState(session: string): Promise<string> {
  const cached = stateCache.get(session);
  if (cached) {
    return cached;
  }
  const request = Promise.resolve(AppService.TakeMiniAppState(session)).then(
    (raw) => {
      if (!raw) {
        stateCache.delete(session);
        throw new Error("empty mini app state");
      }
      return raw;
    },
    (error: unknown) => {
      stateCache.delete(session);
      throw error;
    },
  );
  stateCache.set(session, request);
  return request;
}

/** Parses the JSON session payload; returns null for missing/invalid state. */
export function parseMiniAppState(raw: string): MiniAppState | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MiniAppState> | null;
    if (!parsed || typeof parsed.url !== "string" || !parsed.url) {
      return null;
    }
    return {
      url: parsed.url,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      botName: typeof parsed.botName === "string" ? parsed.botName : undefined,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : undefined,
    };
  } catch {
    return null;
  }
}

/** Only http(s) mini apps are allowed inside the sandboxed iframe. */
export function isAllowedMiniAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * System-browser fallback URL. The URL from `messages.requestWebView` carries
 * the signed Telegram launch data in its hash; a browser would cache it, so the
 * fallback drops the hash and opens only the plain web app address.
 */
export function browserFallbackUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
