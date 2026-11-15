import { useSyncExternalStore } from "react";
import { gradientAverageColor, highlightingColor } from "./wallpaper";

/** Wallpaper part of a global theme variant (kernel ThemeWallpaperDTO). */
export interface ChatThemeWallpaperDTO {
  colors?: number[];
  intensity?: number;
  pattern?: boolean;
  emoticon?: string;
  blur?: boolean;
  dark?: boolean;
  /** Loopback URL of the theme's pattern SVG (served by the kernel). */
  patternUrl?: string;
}

/** One base-theme variant of a global theme (kernel ThemeSettingsDTO). */
export interface ChatThemeSettingsDTO {
  /** "classic" (day), "night", "tinted" or "day". */
  baseTheme?: string;
  dark?: boolean;
  accent?: number;
  outboxAccent?: number;
  messageColors?: number[];
  wallpaper?: ChatThemeWallpaperDTO;
}

/** One global chat theme (kernel ChatThemeDTO + the legacy flat variant). */
export interface ChatThemeDTO {
  id: number;
  accessHash?: number;
  slug?: string;
  title: string;
  emoticon?: string;
  settings?: ChatThemeSettingsDTO[];
  /** Flat fallback variant kept by the kernel for older callers. */
  baseTheme?: string;
  accent?: number;
  outboxAccent?: number;
  messageColors?: number[];
  wallpaper?: ChatThemeWallpaperDTO;
}

/** The base a theme is previewed/applied on. The Web K shell is light-only, so
 * the *applied* theme always uses the day variant; previews follow the current
 * System/Light/Dark selection like the reference client. */
export type ThemeBase = "day" | "night";

export interface ActiveWallpaper {
  /** Four gradient stops, CSS hex. */
  colors: string[];
  /** 0..1, absolute value of wallPaperSettings.intensity / 100. */
  intensity: number;
  /** Pattern SVG URL (the kernel's loopback endpoint or the bundled default). */
  patternUrl: string;
  /** Dark wallpapers draw their pattern as a mask in the reference client. */
  dark: boolean;
}

export interface ActiveTheme {
  /** null = the factory "no custom theme" tile. */
  id: number | null;
  accentHex?: string;
  wallpaper?: ActiveWallpaper;
}

/** The bundled factory doodle pattern (used before the kernel served themes load). */
export const DEFAULT_PATTERN_URL = "/assets/img/pattern.svg";

/** The factory light wallpaper of the Web K "Day" theme. */
export const DEFAULT_WALLPAPER: ActiveWallpaper = {
  colors: ["#b1e0fa", "#82b0d8", "#a0d8e8", "#e5f0f8"],
  intensity: 0.5,
  patternUrl: DEFAULT_PATTERN_URL,
  dark: false,
};

const STORAGE_KEY = "tgdesk.k.themeId";

function intToHex(value: number) {
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Converts a Telegram colour-int list to CSS hex, dropping invalid entries. */
export function themeColorsHex(values?: number[]): string[] {
  return (values ?? [])
    .filter((value) => typeof value === "number" && value >= 0)
    .map(intToHex);
}

function parseHex(hex: string) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ] as const;
}

function mixHex(hex: string, other: string, amount: number) {
  const a = parseHex(hex);
  const b = parseHex(other);
  const mix = (x: number, y: number) =>
    Math.round(x + (y - x) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(a[0], b[0])}${mix(a[1], b[1])}${mix(a[2], b[2])}`;
}

export function variantColors(settings?: ChatThemeSettingsDTO): string[] {
  return themeColorsHex(settings?.wallpaper?.colors);
}

export function variantAccentHex(settings?: ChatThemeSettingsDTO): string | undefined {
  if (typeof settings?.accent === "number" && settings.accent >= 0) {
    return intToHex(settings.accent);
  }
  if (settings?.messageColors?.length) {
    return intToHex(settings.messageColors[settings.messageColors.length - 1]);
  }
  return undefined;
}

/**
 * The settings variant a theme is shown/applied on: the day (Classic/Day base)
 * entry for light mode and the night (Night/Tinted base) entry otherwise, with
 * the other side as fallback when a theme ships only one variant.
 */
export function themeVariant(
  theme: ChatThemeDTO,
  base: ThemeBase,
): ChatThemeSettingsDTO | undefined {
  const settings = theme.settings?.length
    ? theme.settings
    : [
        {
          baseTheme: theme.baseTheme,
          accent: theme.accent,
          outboxAccent: theme.outboxAccent,
          messageColors: theme.messageColors,
          wallpaper: theme.wallpaper,
        },
      ];
  const isDay = (entry: ChatThemeSettingsDTO) =>
    entry.baseTheme === "classic" ||
    entry.baseTheme === "day" ||
    entry.dark === false;
  const wanted = base === "day" ? settings.find(isDay) : settings.find((e) => !isDay(e));
  return wanted ?? settings[0];
}

function wallpaperOf(settings?: ChatThemeSettingsDTO): ActiveWallpaper | undefined {
  const wallpaper = settings?.wallpaper;
  const colors = variantColors(settings);
  if (!wallpaper) {
    return undefined;
  }
  return {
    colors,
    intensity: Math.max(0, Math.min(1, Math.abs(wallpaper.intensity ?? 50) / 100)),
    patternUrl: wallpaper.patternUrl || DEFAULT_PATTERN_URL,
    dark: Boolean(wallpaper.dark),
  };
}

let active: ActiveTheme | null = null;
const listeners = new Set<() => void>();
const resetRoot = () => document.querySelector<HTMLElement>(".k-root");

function emit() {
  for (const listener of listeners) listener();
}

export function useActiveTheme(): ActiveTheme | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => active,
    () => active,
  );
}

export function storedThemeId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function applyAccent(accent: string | undefined) {
  const root = resetRoot();
  if (!root) return;
  if (!accent) {
    for (const property of [
      "--primary-color",
      "--primary-color-rgb",
      "--light-primary-color",
      "--light-filled-primary-color",
      "--dark-primary-color",
    ]) {
      root.style.removeProperty(property);
    }
    return;
  }
  const [r, g, b] = parseHex(accent);
  root.style.setProperty("--primary-color", accent);
  root.style.setProperty("--primary-color-rgb", `${r}, ${g}, ${b}`);
  root.style.setProperty("--light-primary-color", `rgba(${r}, ${g}, ${b}, 0.08)`);
  root.style.setProperty("--light-filled-primary-color", mixHex(accent, "#ffffff", 0.08));
  root.style.setProperty("--dark-primary-color", mixHex(accent, "#000000", 0.08));
}

/**
 * The translucent accent behind service pills and tips plates
 * (`--message-highlighting-color`) follows the theme wallpaper in tweb: the
 * highlighting colour is derived from the wallpaper's average colour, so a
 * green theme gets green service pills instead of the factory blue ones.
 */
function applyHighlight(colors: string[] | undefined) {
  const root = resetRoot();
  if (!root) return;
  if (!colors || colors.length === 0) {
    root.style.removeProperty("--message-highlighting-color");
    root.style.removeProperty("--message-highlighting-color-rgb");
    return;
  }
  const highlight = highlightingColor(gradientAverageColor(colors));
  root.style.setProperty("--message-highlighting-color", highlight.hsla);
  root.style.setProperty("--message-highlighting-color-rgb", highlight.rgb);
}

/**
 * Applies a global chat theme like tweb's themeController: the theme's accent
 * repaints every shell token (`--primary-color` + derived mixes) and its
 * wallpaper (gradient colours + tiled pattern) becomes the page canvas. The
 * Web K shell only has the light token set, so the day (Classic/Day) variant is
 * what gets applied even while the appearance strip previews the night one.
 */
export function applyChatTheme(theme: ChatThemeDTO) {
  const day = themeVariant(theme, "day");
  const accent = variantAccentHex(day) ?? variantAccentHex(themeVariant(theme, "night"));
  const wallpaper = wallpaperOf(day) ?? wallpaperOf(themeVariant(theme, "night"));
  applyAccent(accent);
  applyHighlight(wallpaper?.colors);
  active = {
    id: theme.id,
    accentHex: accent,
    wallpaper,
  };
  try {
    localStorage.setItem(STORAGE_KEY, String(theme.id));
  } catch {
    // Persistence is a nicety; the theme still applies.
  }
  emit();
}

/** Restores the factory light theme (the first, "no custom theme" tile). */
export function resetChatTheme() {
  applyAccent(undefined);
  applyHighlight(undefined);
  active = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}
