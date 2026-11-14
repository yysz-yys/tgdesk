import { useSyncExternalStore } from "react";

/** Wallpaper part of a cloud theme (kernel ThemeWallpaperDTO). */
export interface ChatThemeWallpaperDTO {
  colors?: number[];
  intensity?: number;
  pattern?: boolean;
  emoticon?: string;
  patternUrl?: string;
}

/** One cloud theme (kernel ChatThemeDTO). */
export interface ChatThemeDTO {
  id: number;
  accessHash?: number;
  slug?: string;
  title: string;
  emoticon?: string;
  baseTheme?: string;
  accent?: number;
  outboxAccent?: number;
  wallpaper?: ChatThemeWallpaperDTO;
}

export interface ActiveTheme {
  id: number;
  accentHex?: string;
  wallpaper?: {
    colors: string[];
    intensity: number;
    patternUrl: string;
  };
}

const STORAGE_KEY = "tgdesk.k.themeId";

function intToHex(value: number) {
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
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

let active: ActiveTheme | null = null;
const listeners = new Set<() => void>();

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

/**
 * Applies a cloud theme the way tweb's themeController does for the light base
 * palette: the accent repaints every token the shell uses (`--primary-color`
 * and its light/dark mixes), and the theme's wallpaper replaces the gradient
 * colours and the tiled pattern (KWallpaper).
 */
export function applyChatTheme(theme: ChatThemeDTO) {
  const root = document.querySelector<HTMLElement>(".k-root");
  const accent =
    typeof theme.accent === "number" && theme.accent >= 0
      ? intToHex(theme.accent)
      : undefined;

  if (root && accent) {
    const [r, g, b] = parseHex(accent);
    root.style.setProperty("--primary-color", accent);
    root.style.setProperty("--primary-color-rgb", `${r}, ${g}, ${b}`);
    root.style.setProperty(
      "--light-primary-color",
      `rgba(${r}, ${g}, ${b}, 0.08)`,
    );
    root.style.setProperty(
      "--light-filled-primary-color",
      mixHex(accent, "#ffffff", 0.08),
    );
    root.style.setProperty(
      "--dark-primary-color",
      mixHex(accent, "#000000", 0.08),
    );
  }

  const colors = (theme.wallpaper?.colors ?? [])
    .filter((value) => typeof value === "number" && value >= 0)
    .map(intToHex);
  const wallpaper =
    theme.wallpaper && colors.length >= 2
      ? {
          colors,
          intensity: Math.max(
            0,
            Math.min(1, (theme.wallpaper.intensity ?? 50) / 100),
          ),
          patternUrl: theme.wallpaper.patternUrl ?? "",
        }
      : theme.wallpaper
        ? {
            colors: [],
            intensity: Math.max(
              0,
              Math.min(1, (theme.wallpaper.intensity ?? 50) / 100),
            ),
            patternUrl: theme.wallpaper.patternUrl ?? "",
          }
        : undefined;

  active = { id: theme.id, accentHex: accent, wallpaper };
  try {
    localStorage.setItem(STORAGE_KEY, String(theme.id));
  } catch {
    // Persistence is a nicety; the theme still applies.
  }
  emit();
}
