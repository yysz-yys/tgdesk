import { Browser } from "@wailsio/runtime";

/**
 * In-app navigation for Telegram links.
 *
 * Telegram Web never sends t.me / tg:// links to the system browser: usernames
 * and post links open the chat inside the app, invite links open a join
 * confirmation, and everything else falls back to the system browser. The app
 * registers a single navigator (ResolveTelegramLink binding) at startup; UI
 * components only call `openTelegramLink` / `openTelegramUsername`.
 */
export type TelegramLinkKind = "username" | "post" | "invite" | "user" | "other";

export interface ParsedTelegramLink {
  kind: TelegramLinkKind;
  /** Raw URL handed to the resolver. */
  url: string;
  username?: string;
  postId?: number;
  inviteHash?: string;
  userId?: number;
}

const TELEGRAM_HOSTS = new Set([
  "t.me",
  "telegram.me",
  "telegram.dog",
  "www.t.me",
  "www.telegram.me",
  "www.telegram.dog",
]);

/** Adds a scheme for bare links ("t.me/name", "@name" handled elsewhere). */
export function normalizeLinkUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return value;
  }
  if (/^(https?|tg):\/\//iu.test(value)) {
    return value;
  }
  if (value.startsWith("@")) {
    return `https://t.me/${value.slice(1)}`;
  }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/iu.test(value)) {
    return `https://${value}`;
  }
  if (value.startsWith("+") || value.startsWith("joinchat/")) {
    return `https://t.me/${value}`;
  }
  return `https://${value}`;
}

/** Classifies a Telegram link without any network access. */
export function parseTelegramLink(raw: string): ParsedTelegramLink | null {
  const url = normalizeLinkUrl(raw);
  if (!url) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol === "tg:") {
    const action = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
    const params = parsed.searchParams;
    if (action === "resolve") {
      const domain = params.get("domain") ?? "";
      const post = Number(params.get("post") ?? "");
      if (!domain) {
        return null;
      }
      if (Number.isFinite(post) && post > 0) {
        return { kind: "post", url, username: domain, postId: post };
      }
      return { kind: "username", url, username: domain };
    }
    if (action === "join") {
      const hash = params.get("invite") ?? "";
      if (hash) {
        return { kind: "invite", url, inviteHash: hash };
      }
      return null;
    }
    if (action === "user") {
      const id = Number(params.get("id") ?? "");
      if (Number.isFinite(id) && id > 0) {
        return { kind: "user", url, userId: id };
      }
      return null;
    }
    return { kind: "other", url };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!TELEGRAM_HOSTS.has(host)) {
    return { kind: "other", url };
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { kind: "other", url };
  }
  const first = segments[0];
  if (first === "s" && segments.length >= 2) {
    // Preview link for a public channel: open the channel itself.
    return { kind: "username", url, username: segments[1] };
  }
  if (first === "c" && segments.length >= 2) {
    // Private channel post links need an access hash we cannot get from the
    // URL alone; the resolver reports this as unsupported.
    return { kind: "other", url };
  }
  if (first === "joinchat" && segments.length >= 2) {
    return { kind: "invite", url, inviteHash: segments[1] };
  }
  if (first.startsWith("+")) {
    return { kind: "invite", url, inviteHash: first.slice(1) };
  }
  if (first === "addstickers" || first === "addemoji" || first === "proxy") {
    return { kind: "other", url };
  }
  const post = Number(segments[1] ?? "");
  if (segments.length >= 2 && Number.isFinite(post) && post > 0) {
    return { kind: "post", url, username: first, postId: post };
  }
  return { kind: "username", url, username: first };
}

export type TelegramLinkNavigator = (
  link: ParsedTelegramLink,
) => boolean | Promise<boolean>;

let navigator: TelegramLinkNavigator | null = null;

/** Registers the app-level navigator; returns an unregister function. */
export function setTelegramLinkNavigator(next: TelegramLinkNavigator | null) {
  navigator = next;
}

/** Opens a Telegram link inside the app when possible, else externally. */
export function openTelegramLink(raw: string): void {
  const link = parseTelegramLink(raw);
  if (!link) {
    void Browser.OpenURL(normalizeLinkUrl(raw));
    return;
  }
  if (link.kind === "other") {
    void Browser.OpenURL(link.url);
    return;
  }
  if (!navigator) {
    void Browser.OpenURL(link.url);
    return;
  }
  let result: boolean | Promise<boolean>;
  try {
    result = navigator(link);
  } catch {
    void Browser.OpenURL(link.url);
    return;
  }
  if (typeof result === "boolean") {
    if (!result) {
      void Browser.OpenURL(link.url);
    }
    return;
  }
  void Promise.resolve(result)
    .then((handled) => {
      if (!handled) {
        void Browser.OpenURL(link.url);
      }
    })
    .catch(() => {
      void Browser.OpenURL(link.url);
    });
}

/** Opens a bare @username mention inside the app. */
export function openTelegramUsername(username: string): void {
  const clean = username.replace(/^@+/, "").trim();
  if (!clean) {
    return;
  }
  openTelegramLink(`https://t.me/${clean}`);
}

/** True when the URL is a Telegram peer/invite link we can route in-app. */
export function isTelegramLink(raw: string): boolean {
  const link = parseTelegramLink(raw);
  return Boolean(link && link.kind !== "other");
}
