import type { Appearance } from "../ui/theme";

/**
 * Telegram Mini Apps theme params (keys from
 * https://github.com/Telegram-Mini-Apps/tma.js/blob/master/apps/docs/platform/theming.md)
 * mapped onto the tgdesk F tokens / chat bubble palette. The in-app overlay
 * injects them into the launch URL hash when the server did not provide them.
 */
export type MiniAppThemeParams = Record<string, string>;

const LIGHT_THEME_PARAMS: MiniAppThemeParams = {
  bg_color: "#ffffff",
  secondary_bg_color: "#eef3f6",
  text_color: "#101418",
  hint_color: "#707579",
  link_color: "#3e63dd",
  button_color: "#3e63dd",
  button_text_color: "#ffffff",
  header_bg_color: "#ffffff",
  accent_text_color: "#3e63dd",
  section_bg_color: "#ffffff",
  section_header_text_color: "#3e63dd",
  subtitle_text_color: "#646a73",
  destructive_text_color: "#d64040",
};

const DARK_THEME_PARAMS: MiniAppThemeParams = {
  bg_color: "#1d1d23",
  secondary_bg_color: "#0f1419",
  text_color: "#ededf0",
  hint_color: "#a1a1aa",
  link_color: "#8b95ff",
  button_color: "#8b95ff",
  button_text_color: "#ffffff",
  header_bg_color: "#1d1d23",
  accent_text_color: "#8b95ff",
  section_bg_color: "#1d1d23",
  section_header_text_color: "#8b95ff",
  subtitle_text_color: "#a1a1aa",
  destructive_text_color: "#ff6b6b",
};

export function miniAppThemeParams(appearance: Appearance): MiniAppThemeParams {
  return appearance === "dark" ? DARK_THEME_PARAMS : LIGHT_THEME_PARAMS;
}

/**
 * Injects `tgWebAppThemeParams` into the launch URL hash when the server did not
 * already provide it (requestWebView normally does). Mini apps read launch
 * parameters from `location.hash`, so the hash must never be stripped.
 * Bridge events are not forwarded in v1 (documented limitation).
 */
export function withThemeParams(rawUrl: string, appearance: Appearance): string {
  try {
    const url = new URL(rawUrl);
    const params = new URLSearchParams(
      url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
    );
    if (!params.has("tgWebAppThemeParams")) {
      params.set("tgWebAppThemeParams", JSON.stringify(miniAppThemeParams(appearance)));
    }
    url.hash = params.toString();
    return url.toString();
  } catch {
    return rawUrl;
  }
}
