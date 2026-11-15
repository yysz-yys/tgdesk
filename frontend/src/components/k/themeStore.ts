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

/** The base a theme is previewed/applied on: light shell → day, dark shell → night. */
export type ThemeBase = "day" | "night";

export interface ActiveWallpaper {
  /** Four gradient stops, CSS hex. */
  colors: string[];
  /** 0..1, absolute value of wallPaperSettings.intensity / 100. */
  intensity: number;
  /** Pattern SVG URL (the kernel's loopback endpoint or the bundled default). */
  patternUrl: string;
  /** Dark wallpapers draw their pattern as a light overlay in the reference client. */
  dark: boolean;
  /** The reference's mask render path (factory Night): a black plate with the
   * doodles punched out, the gradient only showing through them. */
  mask: boolean;
}

/** One side (day or night) of the applied cloud theme. */
export interface ThemeVariantState {
  accentHex?: string;
  wallpaper?: ActiveWallpaper;
}

export interface ActiveTheme {
  /** null = the factory "no custom theme" tile. */
  id: number | null;
  /** The theme's Classic/Day variant, used by the light shell. */
  day?: ThemeVariantState;
  /** The theme's Tinted/Night variant, used by the dark shell. */
  night?: ThemeVariantState;
}

/** The bundle's factory doodle pattern, used by the factory and fallback wallpapers. */
export const DEFAULT_PATTERN_URL = "/assets/img/pattern.svg";

/** The factory light wallpaper of the Web K "Day" theme (Android Day). */
export const DEFAULT_WALLPAPER: ActiveWallpaper = {
  colors: ["#b1e0fa", "#82b0d8", "#a0d8e8", "#e5f0f8"],
  intensity: 0.5,
  patternUrl: DEFAULT_PATTERN_URL,
  dark: false,
  mask: false,
};

/** The factory dark wallpaper: tweb DEFAULT_THEME's Night variant (pink→purple). */
export const DEFAULT_NIGHT_WALLPAPER: ActiveWallpaper = {
  colors: ["#fec496", "#dd6cb9", "#962fbf", "#4f5bd5"],
  intensity: 0.5,
  patternUrl: DEFAULT_PATTERN_URL,
  dark: true,
  mask: true,
};

/** The surfaces the accent derivations are mixed against (tweb colorMap night/day). */
const SHELL_SURFACE = { light: "#ffffff", dark: "#212121" } as const;

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

/** `mix(a, b, amount)` = the value `amount` of the way from `a` to `b`. */
function mixHex(base: string, other: string, amount: number) {
  const a = parseHex(base);
  const b = parseHex(other);
  const mix = (x: number, y: number) =>
    Math.round(x + (y - x) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(a[0], b[0])}${mix(a[1], b[1])}${mix(a[2], b[2])}`;
}

/**
 * The reference's `--dark-<colour>`: the accent with its HSL lightness moved
 * down 4 percentage points (tokens.css calls the same value for the factory
 * accent, e.g. `#2d7ed5` → `hsl(211.0714, 66.6667%, 46.5882%)`).
 */
function darkenHex(hex: string) {
  const [r, g, b] = parseHex(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) {
      hue = (g - b) / delta + (g < b ? 6 : 0);
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue *= 60;
  }
  const nextLightness = Math.max(0, (lightness - 0.04) * 100);
  return `hsl(${hue.toFixed(4)}, ${(saturation * 100).toFixed(4)}%, ${nextLightness.toFixed(4)}%)`;
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
  if (base === "day") {
    // The light shell is the Day base: the reference uses the theme's
    // baseThemeDay palette for it (a slightly different accent from Classic).
    // Its wallpaper, though, is often the "plain day white" no-file wallpaper;
    // tweb's getCloudThemeWallpaper then borrows the Classic wallpaper, which is
    // the pastel doodle page the official light mode shows.
    const day = settings.find((entry) => entry.baseTheme === "day");
    const classic = settings.find((entry) => entry.baseTheme === "classic");
    if (!day) {
      return classic ?? settings.find(isDay) ?? settings[0];
    }
    const dayWallpaper = day.wallpaper;
    const plainDay =
      Boolean(dayWallpaper) &&
      (dayWallpaper?.colors?.length ?? 0) === 1 &&
      dayWallpaper?.colors?.[0] === 0xffffff;
    if (plainDay && classic?.wallpaper) {
      return { ...day, wallpaper: classic.wallpaper };
    }
    return day;
  }
  // The official theme set carries an explicit baseThemeNight entry; prefer it
  // over the Tinted one so the dark shell gets the reference's night palette.
  return (
    settings.find((entry) => entry.baseTheme === "night") ??
    settings.find((entry) => !isDay(entry)) ??
    settings[0]
  );
}

function wallpaperOf(settings?: ChatThemeSettingsDTO): ActiveWallpaper | undefined {
  const wallpaper = settings?.wallpaper;
  const colors = variantColors(settings);
  if (!wallpaper) {
    return undefined;
  }
  const base = settings?.baseTheme;
  // Every dark wallpaper (the factory Night one and a cloud theme's Tinted/Night
  // side) uses the reference's mask render path in the dark shell: a black plate
  // with the doodles punched out over the dimmed gradient — the official Web K
  // Night look (black background, theme-coloured doodle line art). The
  // full-brightness inverted-overlay path is only the Tinted *theme* variant in
  // tweb, which this application does not expose.
  const mask =
    Boolean(wallpaper.dark) || base === "night" || base === "tinted";
  return {
    colors,
    intensity: Math.max(0, Math.min(1, Math.abs(wallpaper.intensity ?? 50) / 100)),
    patternUrl: wallpaper.patternUrl || DEFAULT_PATTERN_URL,
    dark: mask,
    mask,
  };
}

function variantOf(theme: ChatThemeDTO, base: ThemeBase): ThemeVariantState {
  const settings = themeVariant(theme, base);
  return {
    accentHex: variantAccentHex(settings),
    wallpaper: wallpaperOf(settings),
  };
}

/** The applied theme's side for a light or dark shell. */
export function variantFor(
  theme: ActiveTheme | null,
  night: boolean,
): ThemeVariantState | null {
  if (!theme) return null;
  return (night ? theme.night : theme.day) ?? null;
}

/** The wallpaper a shell paints: the active theme's side, else the factory one. */
export function activeWallpaper(
  theme: ActiveTheme | null,
  night: boolean,
): ActiveWallpaper {
  const variant = variantFor(theme, night);
  const wallpaper = variant?.wallpaper;
  return wallpaper ?? (night ? DEFAULT_NIGHT_WALLPAPER : DEFAULT_WALLPAPER);
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

const ACCENT_PROPERTIES = [
  "--primary-color",
  "--primary-color-rgb",
  "--light-primary-color",
  "--light-filled-primary-color",
  "--dark-primary-color",
  "--primary-button-color",
  "--link-color",
  "--saved-color",
  "--light-filled-saved-color",
] as const;

function clearAccent(root: HTMLElement) {
  for (const property of ACCENT_PROPERTIES) {
    root.style.removeProperty(property);
  }
}

function applyAccent(accent: string | undefined, night: boolean) {
  const root = resetRoot();
  if (!root) return;
  if (!accent) {
    clearAccent(root);
    return;
  }
  const surface = night ? SHELL_SURFACE.dark : SHELL_SURFACE.light;
  const [r, g, b] = parseHex(accent);
  root.style.setProperty("--primary-color", accent);
  root.style.setProperty("--primary-color-rgb", `${r}, ${g}, ${b}`);
  root.style.setProperty("--light-primary-color", `rgba(${r}, ${g}, ${b}, 0.08)`);
  // tweb's derivative: the "filled" plate behind the selected folder chip is an
  // 8% accent mix over this shell's surface (light: near-white, dark: near-surface).
  root.style.setProperty(
    "--light-filled-primary-color",
    mixHex(surface, accent, 0.08),
  );
  root.style.setProperty("--dark-primary-color", darkenHex(accent));
  root.style.setProperty("--primary-button-color", accent);
  root.style.setProperty("--link-color", accent);
  // Saved Messages follows the theme's accent. The reference always mixes its
  // avatar top against white (tweb applyAppColor saved-color: lightenAlpha .64,
  // mixColor white), so the gradient stays bright in the dark shell too — the
  // factory pair is #b2a6eb over #8774e1 on Night and #78ace4 over #2d7ed5 on Day.
  root.style.setProperty("--saved-color", accent);
  root.style.setProperty(
    "--light-filled-saved-color",
    mixHex("#ffffff", accent, 0.64),
  );
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
 * Re-applies the applied cloud theme's shell tokens for the current brightness,
 * like tweb's `themeController`: the theme's side for this shell supplies the
 * accent (`--primary-color` + every derived mix) and the wallpaper average
 * supplies the highlighting colour. With no custom theme the inline values are
 * removed so the factory tokens of the shell (tokens.css, light/dark blocks)
 * take over.
 */
export function syncShellTheme(theme: ActiveTheme | null, night: boolean) {
  const variant = variantFor(theme, night);
  applyAccent(variant?.accentHex, night);
  applyHighlight(variant?.wallpaper?.colors);
}

/**
 * Applies a global chat theme like tweb's themeController: its day (Classic/Day)
 * and night (Tinted/Night) variants are kept, and the shell tokens/wallpaper
 * follow whichever side the current appearance resolves to (see `KMainScreen`).
 */
export function applyChatTheme(theme: ChatThemeDTO) {
  active = {
    id: theme.id,
    day: variantOf(theme, "day"),
    night: variantOf(theme, "night"),
  };
  try {
    localStorage.setItem(STORAGE_KEY, String(theme.id));
  } catch {
    // Persistence is a nicety; the theme still applies.
  }
  emit();
}

/** Restores the factory look of the current shell (the first, "no theme" tile). */
export function resetChatTheme() {
  active = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}
