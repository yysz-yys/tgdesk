/**
 * Telegram Mini App JS bridge — host-side wire protocol helpers.
 *
 * Mini apps embedded in a host talk over `window.parent.postMessage` with a
 * `{eventType, eventData}` envelope. Telegram clients send the envelope as a
 * JSON string; the Mini Apps SDK accepts `eventData` as an object, a JSON
 * string or `undefined` (and older clients treat `""` as "no data"), so the
 * decoder here is deliberately lenient while the origin/source checks stay
 * strict:
 *
 * - the message must come from *our* iframe (`event.source === iframe.contentWindow`);
 * - its origin must be the origin of the authenticated launch URL; anything else
 *   is ignored before the payload is even parsed.
 *
 * Host -> app events are always encoded as `JSON.stringify({eventType, eventData})`
 * and posted with the app origin as `targetOrigin` (never `*` when the origin is
 * known), so a frame that navigated away never receives answers meant for the
 * previous document.
 *
 * References: `temp/research2/miniapp-overlay.md` §5.5 and Telegram Web K
 * `components/telegramWebView.ts` / `components/webApp.tsx` (the canonical
 * client-side bridge). This module is transport-only: no React, no bindings.
 */

/** One decoded `{eventType, eventData}` envelope sent by a mini app. */
export interface MiniAppBridgeEvent {
  eventType: string;
  eventData: unknown;
}

/** Viewport dimensions reported to the app with `viewport_changed`. */
export interface MiniAppViewport {
  width: number;
  height: number;
  expanded: boolean;
}

/** Telegram clients prolong an open web view every 50 s. */
export const MINI_APP_PROLONG_INTERVAL_MS = 50_000;

/** Minimum interval between two "state stable" viewport reports. */
export const MINI_APP_VIEWPORT_THROTTLE_MS = 120;

/** `#RGB`, `#RRGGBB` and `#RRGGBBAA`; the only colour format the bridge accepts. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Decodes one JSON-looking string; strings that are not JSON are returned
 * unchanged so plain-text payloads are never dropped or mangled.
 */
function decodeJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const first = trimmed[0];
  const looksLikeJson =
    first === "{" ||
    first === "[" ||
    first === '"' ||
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed === "null" ||
    /^-?\d/u.test(trimmed);
  if (!looksLikeJson) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function decodeEventData(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const decoded = decodeJsonString(value);
  // tweb normalises `eventData: ""` to "no data" (TelegramWebView.onMessage).
  return decoded === "" ? undefined : decoded;
}

/**
 * Decodes a raw `message` payload into an event envelope.
 *
 * Accepts the JSON-string form the Telegram SDK sends as well as an already
 * parsed object (some bridges post the object directly). Returns `null` for
 * anything that is not an envelope with a non-empty `eventType`.
 */
export function parseMiniAppEvent(raw: unknown): MiniAppBridgeEvent | null {
  const decoded = typeof raw === "string" ? decodeJsonString(raw) : raw;
  if (!isRecord(decoded)) {
    return null;
  }
  const eventType = decoded.eventType;
  if (typeof eventType !== "string" || eventType.length === 0) {
    return null;
  }
  return { eventType, eventData: decodeEventData(decoded.eventData) };
}

/** Typed access to an event payload; tolerates object / JSON-string / undefined. */
export function eventRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function eventString(value: unknown, key: string): string | undefined {
  const record = eventRecord(value);
  const field = record?.[key];
  return typeof field === "string" ? field : undefined;
}

export function eventBoolean(value: unknown, key: string): boolean | undefined {
  const record = eventRecord(value);
  const field = record?.[key];
  return typeof field === "boolean" ? field : undefined;
}

/** Origin of the authenticated launch URL; the only origin the bridge trusts. */
export function miniAppOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * True when a window `message` event comes from the overlay iframe itself at
 * the mini-app origin. Other frames, extensions and the app shell are ignored.
 */
export function isMiniAppMessageSource(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
  origin: string | null,
): boolean {
  const frameWindow = frame?.contentWindow;
  if (!frameWindow || event.source !== frameWindow) {
    return false;
  }
  if (!origin) {
    return true;
  }
  return event.origin === origin;
}

/**
 * Sends one host -> app event. Returns `false` when the iframe is not mounted
 * yet; the payload is dropped rather than queued (the client answers requests
 * and pushes theme/viewport again once `iframe_ready` arrives).
 */
export function postMiniAppEvent(
  frame: HTMLIFrameElement | null,
  eventType: string,
  eventData?: unknown,
  targetOrigin?: string | null,
): boolean {
  const frameWindow = frame?.contentWindow;
  if (!frameWindow) {
    return false;
  }
  try {
    frameWindow.postMessage(
      JSON.stringify({ eventType, eventData }),
      targetOrigin || "*",
    );
    return true;
  } catch {
    return false;
  }
}

/** `theme_params` payload for the `theme_changed` host event. */
export function themeChangedPayload(
  themeParams: Record<string, string>,
): Record<string, unknown> {
  return { theme_params: { ...themeParams } };
}

/** `viewport_changed` payload: the iframe's current CSS pixel size. */
export function viewportChangedPayload(
  viewport: MiniAppViewport,
): Record<string, unknown> {
  return {
    width: viewport.width,
    height: viewport.height,
    is_state_stable: true,
    is_expanded: viewport.expanded,
  };
}

/** Normalises a bridge colour (`#RRGGBB`); anything else is rejected. */
export function normalizeMiniAppColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed : null;
}

/**
 * Colour from `web_app_set_header_color` / `set_background_color` /
 * `set_bottom_bar_color`: either a literal `color` or a `color_key` naming one
 * of the current theme params (`bg_color`, `secondary_bg_color`, ...).
 */
export function resolveMiniAppColor(
  data: unknown,
  themeParams: Record<string, string>,
): string | null {
  const record = eventRecord(data);
  if (!record) {
    return null;
  }
  const direct = normalizeMiniAppColor(record.color);
  if (direct) {
    return direct;
  }
  const key = record.color_key;
  if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(themeParams, key)) {
    return null;
  }
  return normalizeMiniAppColor(themeParams[key]);
}

function hexChannels(color: string): [number, number, number] | null {
  const hex = color.slice(1).toLowerCase();
  if (hex.length === 3) {
    return [
      Number.parseInt(`${hex[0]}${hex[0]}`, 16),
      Number.parseInt(`${hex[1]}${hex[1]}`, 16),
      Number.parseInt(`${hex[2]}${hex[2]}`, 16),
    ];
  }
  if (hex.length === 6 || hex.length === 8) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

/**
 * Black or white text for a bridge-provided chrome colour. Telegram sends only
 * background colours, so the host has to pick a readable foreground itself.
 * The luminance cut follows the clients' look: white text on saturated/dark
 * chrome (accent blues, night headers) and black text on light/pastel chrome.
 */
export function miniAppContrastColor(color: string): "#000000" | "#ffffff" {
  const channels = hexChannels(color);
  if (!channels) {
    return "#ffffff";
  }
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#000000" : "#ffffff";
}

/** External link from `web_app_open_link`; only http(s) may leave the app. */
export function externalWebLink(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * `web_app_open_tg_link` carries `path_full` (e.g. `/durov`, `/joinchat/abc`);
 * returns the https://t.me URL the app-wide Telegram-link navigator consumes.
 */
export function telegramLinkFromPath(pathFull: unknown): string | null {
  if (typeof pathFull !== "string") {
    return null;
  }
  const trimmed = pathFull.trim();
  if (!trimmed || /[\s\\]/u.test(trimmed)) {
    return null;
  }
  if (
    trimmed.startsWith("https://t.me/") ||
    trimmed.startsWith("https://telegram.me/") ||
    trimmed.startsWith("https://telegram.dog/")
  ) {
    return externalWebLink(trimmed);
  }
  if (!trimmed.startsWith("/")) {
    return null;
  }
  try {
    const url = new URL(`https://t.me${trimmed}`);
    if (!url.pathname || url.pathname === "/") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
