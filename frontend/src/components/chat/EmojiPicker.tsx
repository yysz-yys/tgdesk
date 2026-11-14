/**
 * Telegram Web K / Desktop style emoji picker for the composer.
 *
 * The panel is positioned by the caller: it renders `position: absolute` inside
 * the composer card (`inset-inline-end: 0; bottom: calc(100% + 8px)`) and the
 * composer card is the relatively positioned container. Geometry (382 × 420 px,
 * 20 px radius, 49 px footer, 38 px search field, 42 px/8-column emoji grid)
 * follows the measured Telegram Web K values in temp/research/emoji-picker.md §3.
 *
 * The emoji tab mirrors web.telegram.org exactly: the full Web K catalogue (7
 * categories, 1,903 emoji) from `../data/emoji`, drawn with Web K's own Apple
 * emoji PNGs served from `/emoji/<unified>.png` instead of the platform glyphs
 * (see `../lib/emojiImage`). Skin tones follow Web K too: right-click or
 * long-press a tile that has variants to open a 6-swatch popover (default +
 * 1f3fb…1f3ff); the choice is remembered per base emoji in localStorage and
 * applied to every tile, search result and recent of that emoji, while recents
 * keep storing the base emoji (Web K's normalization).
 *
 * Tabs: emoji (bundled offline catalogue + localised keyword search), stickers
 * and GIFs (real backend data via `src/lib/stickerApi.ts`, bodies in
 * `./picker/**`). The emoji body owns the search row and category row; the
 * stickers/GIF bodies are separate panels with their own geometry (5×72 sticker
 * grid behind a 49 px set rail; 3×124 GIF grid) and keep the shared panel frame,
 * pop animation, close/Escape/outside-click/focus behaviour and custom overlay
 * scrollbar. Each new tab fetches lazily on its first open (module-level caches
 * in stickerApi) and its cells send through the optional `onSendSticker` /
 * `onSendGif` callbacks while the panel stays open.
 *
 * Search keywords are bundled offline: `../data/emojiKeywords.*.ts` ships the
 * per-language tables (loaded lazily on first open for the active UI language,
 * cached afterwards), aligned index-for-index with `EMOJI_ALL`.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Car,
  Clapperboard,
  Clock,
  Flag,
  Lightbulb,
  Loader2,
  PawPrint,
  Search,
  Smile,
  Sticker,
  Utensils,
  Volleyball,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  EMOJI_ALL,
  EMOJI_CATEGORIES,
  EMOJI_POPULAR,
  type EmojiCategoryId,
} from "../../data/emoji";
import {
  loadEmojiKeywords,
  resolveEmojiKeywordLanguage,
  type EmojiKeywordTable,
} from "../../data/emojiKeywords";
import {
  EMOJI_TONE_SWATCH_COUNT,
  emojiImageUrl,
  emojiSkinToneBase,
  emojiSkinToneVariants,
  emojiWithSkinTone,
  hasEmojiSkinTones,
} from "../../lib/emojiImage";
import { cn } from "../../lib/cn";
import type { PickerNetwork } from "../../lib/stickerApi";
import { GifsTab } from "./picker/GifsTab";
import { StickersTab } from "./picker/StickersTab";
import "./emoji-picker.css";

export type { PickerNetwork } from "../../lib/stickerApi";

export type EmojiPickerTab = "emoji" | "stickers" | "gifs";

export interface EmojiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the raw Unicode emoji; the caller inserts it at the caret. */
  onPick: (emoji: string) => void;
  /**
   * Account transport for the stickers/GIF tabs (`proxyUrl` + `settings.ntp`),
   * same pair the rest of AppService takes. Without it the two new tabs show
   * their "unavailable" state instead of firing RPCs.
   */
  network?: PickerNetwork;
  /** Sends a sticker document by its opaque kernel ref; panel stays open. */
  onSendSticker?: (ref: string) => void | Promise<unknown>;
  /** Sends a saved GIF document by its opaque kernel ref; panel stays open. */
  onSendGif?: (ref: string) => void | Promise<unknown>;
  /**
   * Sends one inline GIF search result (`messages.sendInlineBotResult`). The
   * picker has no chat id, so the host wires this through ChatView/App to
   * `AppService.SendInlineGif`; without it the GIF tab cannot send search hits
   * (their refs are inline handles, not document refs).
   */
  onSendInlineGif?: (
    queryId: number,
    resultId: string,
    replyToID?: number,
  ) => void | Promise<unknown>;
  /** Peer rights: when false the stickers tab shows the blocked message. */
  canSendStickers?: boolean;
  /** Peer rights: when false the GIF tab shows the blocked message. */
  canSendGifs?: boolean;
  /** Tab to open on the next panel open (e.g. stickers when text is banned). */
  initialTab?: EmojiPickerTab;
  /** Optional toast channel (send failures in the stickers/GIF tabs). */
  onToast?: (message: string) => void;
  /** Optional: the composer trigger; focus returns there when the panel closes. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** Optional extra class name for the panel (caller owns placement). */
  className?: string;
}

const RECENT_STORAGE_KEY = "tgdesk.emoji.recent.v1";
const TONE_STORAGE_KEY = "tgdesk.emoji.tones.v1";
const RECENT_MAX = 32;
const SEARCH_RESULT_LIMIT = 120;
const LONG_PRESS_MS = 450;
const TAB_ORDER: readonly EmojiPickerTab[] = ["emoji", "stickers", "gifs"];
/** Every catalogue emoji, for filtering stale recents from older catalogues. */
const CATALOGUE_EMOJI: ReadonlySet<string> = new Set(EMOJI_ALL);
const CATEGORY_ICONS: Record<EmojiCategoryId, LucideIcon> = {
  smileys: Smile,
  animals: PawPrint,
  food: Utensils,
  travel: Car,
  activity: Volleyball,
  objects: Lightbulb,
  flags: Flag,
};
const TAB_ICONS: Record<EmojiPickerTab, LucideIcon> = {
  emoji: Smile,
  stickers: Sticker,
  gifs: Clapperboard,
};

interface CategoryRowItem {
  id: EmojiCategoryId | "recent";
  icon: LucideIcon;
}

const CATEGORY_ROW: readonly CategoryRowItem[] = [
  { id: "recent", icon: Clock },
  ...EMOJI_CATEGORIES.map((category) => ({ id: category.id, icon: CATEGORY_ICONS[category.id] })),
];

// ------------------------------------------------------------ tone storage

type ToneMap = Record<string, number>;

function sanitizeTone(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < EMOJI_TONE_SWATCH_COUNT
    ? value
    : 0;
}

/** Per-base skin-tone choices, JSON in localStorage (single map, Web K-like). */
function readToneMap(): ToneMap {
  try {
    const raw = localStorage.getItem(TONE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const result: ToneMap = {};
    for (const [base, value] of Object.entries(parsed as Record<string, unknown>)) {
      const tone = sanitizeTone(value);
      if (tone > 0) {
        result[base] = tone;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeToneMap(map: ToneMap): void {
  try {
    localStorage.setItem(TONE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Best effort: the pick still uses the chosen variant for this session.
  }
}

// ------------------------------------------------------------------ recents

function sanitizeRecent(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) {
      continue;
    }
    // Web K keeps recents normalized to the base emoji, never a tone variant.
    const base = emojiSkinToneBase(item);
    if (seen.has(base) || !CATALOGUE_EMOJI.has(base)) {
      continue;
    }
    seen.add(base);
    result.push(base);
    if (result.length >= RECENT_MAX) {
      break;
    }
  }
  return result;
}

/** Recents for display: stored MRU list, or the Telegram "frequently used" seed. */
function readRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    const stored = sanitizeRecent(raw ? (JSON.parse(raw) as unknown) : []);
    if (stored.length > 0) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (privacy mode); the seed still renders.
  }
  return EMOJI_POPULAR.slice(0, RECENT_MAX);
}

function writeRecentEmoji(emoji: string): string[] {
  const next = sanitizeRecent([emoji, ...readRecentEmojis()]);
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best effort: recents are a convenience, never a reason to fail a pick.
  }
  return next;
}

/** Records a picked (or sent) emoji as the newest recent one (base emoji). */
export function recordRecentEmoji(emoji: string): void {
  writeRecentEmoji(emojiSkinToneBase(emoji));
}

// ------------------------------------------------------------------- search

interface IndexedEmoji {
  readonly emoji: string;
  readonly words: readonly string[];
}

function keywordWords(list: readonly string[] | undefined): readonly string[] {
  if (!list || list.length === 0) {
    return [];
  }
  const words = new Set<string>();
  for (const keyword of list) {
    const value = keyword.trim().toLowerCase();
    if (!value) {
      continue;
    }
    words.add(value);
    if (value.includes(" ")) {
      for (const part of value.split(/\s+/)) {
        if (part) {
          words.add(part);
        }
      }
    }
  }
  return [...words];
}

function buildSearchIndex(keywords: EmojiKeywordTable | null): readonly IndexedEmoji[] {
  return EMOJI_ALL.map((emoji, index) => ({
    emoji,
    words: keywordWords(keywords?.[index]),
  }));
}

/**
 * Prefix search over the localised CLDR keywords. Every whitespace-separated
 * token must prefix-match a keyword (or be the raw emoji itself); shorter /
 * exact matches rank first, then catalogue order. Mirrors Telegram's local
 * keyword search without a debounce — 1,903 rows are scanned in well under 1 ms.
 */
function searchEmoji(index: readonly IndexedEmoji[], query: string): string[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }
  const scored: Array<{ emoji: string; score: number; order: number }> = [];
  for (let order = 0; order < index.length; order += 1) {
    const entry = index[order];
    let total = 0;
    let matches = true;
    for (const token of tokens) {
      let best = Number.POSITIVE_INFINITY;
      if (entry.emoji === token) {
        best = 0;
      } else if (token.length > 1 && entry.emoji.includes(token)) {
        best = 2;
      }
      for (const word of entry.words) {
        if (word.length < token.length || !word.startsWith(token)) {
          continue;
        }
        const rank = word.length === token.length ? 0 : 1 + word.length;
        if (rank < best) {
          best = rank;
        }
        if (best === 0) {
          break;
        }
      }
      if (best === Number.POSITIVE_INFINITY) {
        matches = false;
        break;
      }
      total += best;
    }
    if (matches) {
      scored.push({ emoji: entry.emoji, score: total, order });
    }
  }
  scored.sort((left, right) => left.score - right.score || left.order - right.order);
  return scored.slice(0, SEARCH_RESULT_LIMIT).map((entry) => entry.emoji);
}

// ------------------------------------------------------------------- tiles

interface EmojiTileProps {
  /** Base emoji in the catalogue (recents/search are normalized to bases). */
  base: string;
  /** Tone-applied raw emoji: what the tile draws and what a click returns. */
  display: string;
  index: number;
  tabbable: boolean;
  onPick: (base: string) => void;
  onOpenTonePicker: (base: string, anchor: HTMLElement) => void;
  onFocusTile: (index: number) => void;
}

const EmojiTile = memo(function EmojiTile({
  base,
  display,
  index,
  tabbable,
  onPick,
  onOpenTonePicker,
  onFocusTile,
}: EmojiTileProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const imageSrc = emojiImageUrl(display);
  const toneEnabled = hasEmojiSkinTones(base);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => cancelLongPress, [cancelLongPress]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!toneEnabled || event.pointerType === "mouse") {
        return;
      }
      const anchor = event.currentTarget;
      longPressFiredRef.current = false;
      cancelLongPress();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressFiredRef.current = true;
        onOpenTonePicker(base, anchor);
      }, LONG_PRESS_MS);
    },
    [base, cancelLongPress, onOpenTonePicker, toneEnabled],
  );

  const handleClick = useCallback(() => {
    if (longPressFiredRef.current) {
      // The long press already opened the tone picker; don't also insert.
      longPressFiredRef.current = false;
      return;
    }
    onPick(base);
  }, [base, onPick]);

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (!toneEnabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      longPressFiredRef.current = false;
      cancelLongPress();
      onOpenTonePicker(base, event.currentTarget);
    },
    [base, cancelLongPress, onOpenTonePicker, toneEnabled],
  );

  return (
    <button
      type="button"
      className="g-emoji-picker-tile"
      data-emoji={base}
      data-emoji-index={index}
      data-emoji-variant={display !== base ? display : undefined}
      data-emoji-tones={toneEnabled ? "true" : undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={display}
      onFocus={() => onFocusTile(index)}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerMove={cancelLongPress}
    >
      {failedSrc === imageSrc ? (
        <span className="g-emoji-picker-glyph" aria-hidden="true">
          {display}
        </span>
      ) : (
        <img
          className="f-emoji-img"
          src={imageSrc}
          width={32}
          height={32}
          alt={display}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(imageSrc)}
        />
      )}
    </button>
  );
});

interface EmojiSectionProps {
  id: string;
  label: string;
  emoji: readonly string[];
  /** Flat index of the section's first tile inside the rendered grid. */
  offset: number;
  focusedIndex: number;
  toneFor: (base: string) => number;
  onPick: (base: string) => void;
  onOpenTonePicker: (base: string, anchor: HTMLElement) => void;
  onFocusTile: (index: number) => void;
}

const EmojiSection = memo(function EmojiSection({
  id,
  label,
  emoji,
  offset,
  focusedIndex,
  toneFor,
  onPick,
  onOpenTonePicker,
  onFocusTile,
}: EmojiSectionProps) {
  return (
    <section className="g-emoji-picker-section" data-section-id={id}>
      <div className="g-emoji-picker-header">{label}</div>
      <div className="g-emoji-picker-grid">
        {emoji.map((base, localIndex) => {
          const index = offset + localIndex;
          return (
            <EmojiTile
              key={base}
              base={base}
              display={emojiWithSkinTone(base, toneFor(base))}
              index={index}
              tabbable={index === focusedIndex}
              onPick={onPick}
              onOpenTonePicker={onOpenTonePicker}
              onFocusTile={onFocusTile}
            />
          );
        })}
      </div>
    </section>
  );
});

interface PickerSection {
  id: EmojiCategoryId | "recent";
  label: string;
  emoji: readonly string[];
  offset: number;
}

// -------------------------------------------------------------- tone picker

interface ToneMenuState {
  base: string;
  anchorRect: DOMRect;
  selected: number;
  anchor: HTMLElement | null;
}

interface TonePopoverProps {
  menu: ToneMenuState;
  label: string;
  defaultLabel: string;
  onSelect: (tone: number) => void;
}

/** Six swatches (default + five tones) floating above/below a tile. */
function EmojiTonePopover({ menu, label, defaultLabel, onSelect }: TonePopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const variants = emojiSkinToneVariants(menu.base) ?? [];

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) {
      return;
    }
    const { width, height } = node.getBoundingClientRect();
    const margin = 8;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const { anchorRect } = menu;
    let top = anchorRect.top - height - 6;
    if (top < margin) {
      top = anchorRect.bottom + 6;
    }
    top = Math.min(Math.max(margin, top), Math.max(margin, viewHeight - height - margin));
    const desiredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
    const left = Math.min(Math.max(margin, desiredLeft), Math.max(margin, viewWidth - width - margin));
    setPosition({ left, top });
  }, [menu]);

  // The swatches are `visibility: hidden` until measured; focus the selected one
  // only once it is actually visible so keyboard users land inside the popover.
  useEffect(() => {
    if (!position) {
      return;
    }
    const node = rootRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    node?.focus();
  }, [position]);

  return createPortal(
    <div
      ref={rootRef}
      className="g-emoji-tone-popover"
      data-emoji-tone-popover="true"
      role="menu"
      aria-label={label}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {variants.map((emoji, tone) => (
        <button
          key={emoji}
          type="button"
          role="menuitemradio"
          aria-checked={tone === menu.selected}
          aria-label={tone === 0 ? defaultLabel : emoji}
          title={tone === 0 ? defaultLabel : emoji}
          className="g-emoji-tone-swatch"
          onClick={() => onSelect(tone)}
        >
          <img
            className="f-emoji-img f-emoji-tone-img"
            src={emojiImageUrl(emoji)}
            width={26}
            height={26}
            alt=""
            decoding="async"
            draggable={false}
          />
        </button>
      ))}
    </div>,
    document.body,
  );
}

/**
 * Telegram-style emoji picker panel. Renders nothing while `open` is false, so
 * mounting it conditionally is fine — the opening scale/fade animation runs on
 * mount. The caller owns the open state and inserts `onPick`'s emoji at the
 * textarea caret (see `insertEmojiAtCursor` in src/lib/emojiInsert.ts).
 */
export function EmojiPicker({
  open,
  onOpenChange,
  onPick,
  network,
  onSendSticker,
  onSendGif,
  onSendInlineGif,
  canSendStickers,
  canSendGifs,
  initialTab,
  onToast,
  triggerRef,
  className,
}: EmojiPickerProps) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<EmojiPickerTab>(initialTab ?? "emoji");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecentEmojis);
  const [tones, setTones] = useState<ToneMap>(readToneMap);
  const [toneMenu, setToneMenu] = useState<ToneMenuState | null>(null);
  const [keywordState, setKeywordState] = useState<{
    language: string;
    table: EmojiKeywordTable;
  } | null>(null);
  const [keywordFailed, setKeywordFailed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("recent");
  const [focusedIndex, setFocusedIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollbarRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const thumbDragRef = useRef<{
    startY: number;
    startScrollTop: number;
    thumbRange: number;
    maxScroll: number;
  } | null>(null);
  const spyLockUntilRef = useRef(0);
  const pendingCategoryRef = useRef<string | null>(null);
  const restoredFocusRef = useRef(false);
  const suppressRestoreRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const initialTabRef = useRef<EmojiPickerTab>(initialTab ?? "emoji");
  initialTabRef.current = initialTab ?? "emoji";
  const tonesRef = useRef<ToneMap>(tones);
  tonesRef.current = tones;
  const toneMenuRef = useRef<ToneMenuState | null>(toneMenu);
  toneMenuRef.current = toneMenu;

  const language = resolveEmojiKeywordLanguage(i18n.resolvedLanguage ?? i18n.language);
  const searchText = query.trim();
  const searching = searchText.length > 0;
  const keywords = keywordState && keywordState.language === language ? keywordState.table : null;
  const searchIndex = useMemo(() => (keywords ? buildSearchIndex(keywords) : null), [keywords]);
  const searchResults = useMemo(
    () => (searching && searchIndex ? searchEmoji(searchIndex, searchText) : null),
    [searchIndex, searching, searchText],
  );

  const sections = useMemo<PickerSection[]>(() => {
    const list: PickerSection[] = [
      { id: "recent", label: t("emojiPicker.recent"), emoji: recent, offset: 0 },
    ];
    let offset = recent.length;
    for (const category of EMOJI_CATEGORIES) {
      list.push({
        id: category.id,
        label: t(`emojiPicker.categories.${category.id}`),
        emoji: category.emoji,
        offset,
      });
      offset += category.emoji.length;
    }
    return list;
  }, [recent, t]);

  const toneFor = useCallback((base: string) => tones[base] ?? 0, [tones]);

  const normalLength = recent.length + EMOJI_ALL.length;
  const viewLength = searching ? (searchResults?.length ?? 0) : normalLength;

  const openTonePicker = useCallback((base: string, anchor: HTMLElement) => {
    if (!hasEmojiSkinTones(base)) {
      return;
    }
    setToneMenu({
      base,
      anchorRect: anchor.getBoundingClientRect(),
      selected: tonesRef.current[base] ?? 0,
      anchor,
    });
  }, []);

  const selectTone = useCallback((tone: number) => {
    const menu = toneMenuRef.current;
    if (!menu) {
      return;
    }
    const next: ToneMap = { ...tonesRef.current };
    if (tone === 0) {
      delete next[menu.base];
    } else {
      next[menu.base] = tone;
    }
    writeToneMap(next);
    tonesRef.current = next;
    setTones(next);
    setToneMenu(null);
    // Return focus to the tile so arrow-key navigation keeps working.
    requestAnimationFrame(() => {
      if (menu.anchor?.isConnected) {
        menu.anchor.focus();
      }
    });
  }, []);

  // Reset transient UI state every time the panel opens; focus the search field
  // (or, when the caller asks for stickers/GIFs, the tab body focuses itself).
  useEffect(() => {
    if (!open) {
      restoredFocusRef.current = false;
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    suppressRestoreRef.current = false;
    const wantedTab = initialTabRef.current;
    setTab(wantedTab);
    setQuery("");
    setRecent(readRecentEmojis());
    setTones(readToneMap());
    setToneMenu(null);
    setFocusedIndex(0);
    setActiveCategory("recent");
    const frame = requestAnimationFrame(() => {
      if (wantedTab === "emoji") {
        searchRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Return focus to the composer trigger when the panel closes (but never steal
  // it from whatever the user clicked or from the textarea they are typing in).
  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = rootRef.current;
    return () => {
      if (restoredFocusRef.current) {
        return;
      }
      restoredFocusRef.current = true;
      if (suppressRestoreRef.current) {
        suppressRestoreRef.current = false;
        return;
      }
      const active = document.activeElement;
      const focusWasInsidePanel = active instanceof HTMLElement && panel?.contains(active);
      const focusWasLost = !(active instanceof HTMLElement) || active === document.body;
      if (!focusWasInsidePanel && !focusWasLost) {
        return;
      }
      const target = triggerRef?.current ?? previousFocusRef.current;
      target?.focus();
    };
  }, [open, triggerRef]);

  // Load (and cache) the localised keyword table on first open.
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setKeywordFailed(false);
    loadEmojiKeywords(language).then(
      (table) => {
        if (!cancelled) {
          setKeywordState({ language, table });
        }
      },
      () => {
        if (!cancelled) {
          setKeywordFailed(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [language, open]);

  // The tone popover is anchored to a fixed-position rectangle; any scroll or
  // resize would leave it misplaced, so dismiss it (Web K closes on scroll too).
  useEffect(() => {
    if (!toneMenu) {
      return;
    }
    const close = () => setToneMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [toneMenu]);

  // Outside click closes; clicks inside the composer the panel is anchored to
  // (the plate with the textarea and the emoji trigger) intentionally keep it
  // open so the caret can be repositioned, matching Telegram Web K.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-emoji-tone-popover]")) {
        return;
      }
      // The sticker/GIF tabs open Radix menus (set actions, sticker favorites).
      // They are portalled to <body>, so a click on a menu item would otherwise
      // look like an outside click and close the whole picker before the item's
      // onSelect can run.
      if (
        target.closest(
          "[data-radix-popper-content-wrapper], [role='menu'], .f-menu, .f-menu-content",
        )
      ) {
        return;
      }
      const root = rootRef.current;
      if (root?.contains(target)) {
        if (toneMenuRef.current) {
          setToneMenu(null);
        }
        return;
      }
      if (toneMenuRef.current) {
        setToneMenu(null);
      }
      const anchor = root?.parentElement;
      if (anchor?.contains(target)) {
        return;
      }
      if (target.closest(".f-composer, .g-composer, [data-emoji-picker-anchor]")) {
        return;
      }
      suppressRestoreRef.current = true;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onOpenChange, open]);

  // Escape: close the tone popover first, then clear a non-empty query, then
  // close the panel (Telegram behaviour).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (toneMenuRef.current) {
        event.preventDefault();
        const anchor = toneMenuRef.current.anchor;
        setToneMenu(null);
        requestAnimationFrame(() => {
          if (anchor?.isConnected) {
            anchor.focus();
          }
        });
        return;
      }
      if (query && tab === "emoji") {
        event.preventDefault();
        setQuery("");
        setFocusedIndex(0);
        searchRef.current?.focus();
        return;
      }
      event.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open, query, tab]);

  // Scroll spy: highlight the category whose section header is currently stuck.
  // While a category-button jump is smoothly scrolling, the clicked category
  // stays highlighted until the target settles (or `scrollend` fires).
  useEffect(() => {
    if (!open || tab !== "emoji" || searching) {
      return;
    }
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const pending = pendingCategoryRef.current;
      if (pending) {
        if (Date.now() < spyLockUntilRef.current) {
          const target = scroller.querySelector<HTMLElement>(
            `[data-section-id="${pending}"]`,
          );
          const delta = target
            ? target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
            : 0;
          if (Math.abs(delta) > 2) {
            return;
          }
        }
        pendingCategoryRef.current = null;
      }
      const sectionsInDom = scroller.querySelectorAll<HTMLElement>("[data-section-id]");
      if (sectionsInDom.length === 0) {
        return;
      }
      const containerTop = scroller.getBoundingClientRect().top;
      let current = sectionsInDom[0].dataset.sectionId ?? "recent";
      for (const section of sectionsInDom) {
        if (section.getBoundingClientRect().top - containerTop <= 44) {
          current = section.dataset.sectionId ?? current;
        }
      }
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      if (atBottom) {
        current = sectionsInDom[sectionsInDom.length - 1].dataset.sectionId ?? current;
      }
      setActiveCategory((previous) => (previous === current ? previous : current));
    };
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    const onScrollEnd = () => {
      if (pendingCategoryRef.current) {
        spyLockUntilRef.current = 0;
        onScroll();
      }
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("scrollend", onScrollEnd);
    update();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("scrollend", onScrollEnd);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [open, searching, sections, tab]);

  // Custom overlay scrollbar (Web K `.scrollable-y`). A native scrollbar would
  // steal 8 px of the 382 px popup and collapse the 8-column grid to 7 columns,
  // so the scroll container hides it and this thin thumb overlays the gutter.
  const updateScrollbar = useCallback(() => {
    const scroller = scrollRef.current;
    const track = scrollbarRef.current;
    const thumb = thumbRef.current;
    if (!scroller || !track || !thumb) {
      return;
    }
    const { clientHeight, scrollHeight, scrollTop } = scroller;
    const visible = clientHeight > 0 && scrollHeight > clientHeight + 1;
    track.style.display = visible ? "block" : "none";
    if (!visible) {
      return;
    }
    const thumbHeight = Math.max(24, Math.round((clientHeight * clientHeight) / scrollHeight));
    const range = clientHeight - thumbHeight;
    const maxScroll = scrollHeight - clientHeight;
    const offset = maxScroll <= 0 ? 0 : Math.round((scrollTop / maxScroll) * range);
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${offset}px)`;
  }, []);

  useEffect(() => {
    if (!open || tab !== "emoji") {
      return;
    }
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateScrollbar();
      });
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    if (scroller.firstElementChild) {
      observer.observe(scroller.firstElementChild);
    }
    updateScrollbar();
    return () => {
      scroller.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [open, recent, searching, searchResults, sections, tab, updateScrollbar]);

  const onThumbPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollRef.current;
    const thumb = thumbRef.current;
    if (!scroller || !thumb) {
      return;
    }
    const thumbRange = scroller.clientHeight - thumb.offsetHeight;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    if (thumbRange <= 0 || maxScroll <= 0) {
      return;
    }
    event.preventDefault();
    thumbDragRef.current = {
      startY: event.clientY,
      startScrollTop: scroller.scrollTop,
      thumbRange,
      maxScroll,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the pointer is already gone; dragging still
      // works through the element-level move handler.
    }
  }, []);

  const onThumbPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = thumbDragRef.current;
    const scroller = scrollRef.current;
    if (!drag || !scroller) {
      return;
    }
    scroller.scrollTop =
      drag.startScrollTop + ((event.clientY - drag.startY) / drag.thumbRange) * drag.maxScroll;
  }, []);

  const stopThumbDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    thumbDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer was already released (e.g. pointercancel).
    }
  }, []);

  const pickEmoji = useCallback(
    (base: string) => {
      const value = emojiWithSkinTone(base, tonesRef.current[base] ?? 0);
      // Recents keep the base emoji (Web K normalizes variants); the pick is the
      // tone variant so the composer inserts exactly what the tile shows.
      setRecent(writeRecentEmoji(base));
      onPick(value);
    },
    [onPick],
  );

  const handleTileFocus = useCallback((index: number) => {
    setFocusedIndex(index);
  }, []);

  const focusTile = useCallback(
    (index: number) => {
      const root = rootRef.current;
      if (!root || viewLength === 0) {
        return;
      }
      const clamped = Math.max(0, Math.min(viewLength - 1, index));
      const node = root.querySelector<HTMLButtonElement>(`[data-emoji-index="${clamped}"]`);
      if (!node) {
        return;
      }
      setFocusedIndex(clamped);
      node.focus();
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [viewLength],
  );

  const handleGridKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const tile = target.closest<HTMLButtonElement>("[data-emoji-index]");
      if (!tile) {
        return;
      }
      const index = Number(tile.dataset.emojiIndex ?? "");
      if (!Number.isFinite(index)) {
        return;
      }
      const grid = tile.parentElement;
      const columns = grid
        ? Math.max(
            1,
            getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
          )
        : 8;
      const rtl = getComputedStyle(tile).direction === "rtl";
      let next: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
          next = rtl ? index + 1 : index - 1;
          break;
        case "ArrowRight":
          next = rtl ? index - 1 : index + 1;
          break;
        case "ArrowUp":
          next = index - columns;
          break;
        case "ArrowDown":
          next = index + columns;
          break;
        case "PageUp":
          next = index - columns * 6;
          break;
        case "PageDown":
          next = index + columns * 6;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = viewLength - 1;
          break;
        default:
          return;
      }
      if (next === null) {
        return;
      }
      event.preventDefault();
      focusTile(next);
    },
    [focusTile, viewLength],
  );

  const jumpToCategory = useCallback((id: string) => {
    setActiveCategory(id);
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    const section = scroller.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
    if (!section) {
      return;
    }
    pendingCategoryRef.current = id;
    spyLockUntilRef.current = Date.now() + 1500;
    const top =
      section.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  // Switching tabs swaps the whole body: the emoji tab keeps its own markup and
  // search row; the stickers/GIF tabs mount their real data bodies (the first
  // mount of each is what triggers that tab's lazy fetch, cached module-side).
  const selectTab = useCallback((nextTab: EmojiPickerTab) => {
    setToneMenu(null);
    setTab(nextTab);
    if (nextTab === "emoji") {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, []);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setFocusedIndex(0);
  }, []);

  if (!open) {
    return null;
  }

  let content: ReactNode;
  if (!searching) {
    content = sections.map((section) => (
      <EmojiSection
        key={section.id}
        id={section.id}
        label={section.label}
        emoji={section.emoji}
        offset={section.offset}
        focusedIndex={focusedIndex}
        toneFor={toneFor}
        onPick={pickEmoji}
        onOpenTonePicker={openTonePicker}
        onFocusTile={handleTileFocus}
      />
    ));
  } else if (searchResults === null) {
    content = keywordFailed ? (
      <div className="g-emoji-picker-empty" role="status">
        {t("emojiPicker.searchFailed")}
      </div>
    ) : (
      <div className="g-emoji-picker-empty" role="status">
        <Loader2 className="g-emoji-picker-spinner" size={20} aria-hidden="true" />
        <span>{t("emojiPicker.loading")}</span>
      </div>
    );
  } else if (searchResults.length === 0) {
    content = (
      <div className="g-emoji-picker-empty" role="status">
        {t("emojiPicker.noResults")}
      </div>
    );
  } else {
    content = (
      <div className="g-emoji-picker-grid g-emoji-picker-results">
        {searchResults.map((base, index) => (
          <EmojiTile
            key={`search:${base}`}
            base={base}
            display={emojiWithSkinTone(base, toneFor(base))}
            index={index}
            tabbable={index === focusedIndex}
            onPick={pickEmoji}
            onOpenTonePicker={openTonePicker}
            onFocusTile={handleTileFocus}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn("g-emoji-picker", className)}
      role="dialog"
      aria-modal="false"
      aria-label={t("emojiPicker.title")}
      data-testid="emoji-picker"
      data-searching={searching ? "true" : undefined}
      data-tab={tab}
    >
      {tab === "emoji" ? (
        <div
          className="g-emoji-picker-body"
          id="g-emoji-picker-panel-emoji"
          role="tabpanel"
          aria-labelledby="g-emoji-picker-tab-emoji"
        >
        <div className="g-emoji-picker-search" role="search">
          <Search className="g-emoji-picker-search-icon" size={17} strokeWidth={1.9} aria-hidden="true" />
          <input
            ref={searchRef}
            className="g-emoji-picker-search-input"
            type="text"
            value={query}
            placeholder={t("emojiPicker.search")}
            aria-label={t("emojiPicker.search")}
            data-testid="emoji-picker-search"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => handleQueryChange(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="g-emoji-picker-search-clear"
              aria-label={t("emojiPicker.clearSearch")}
              title={t("emojiPicker.clearSearch")}
              onClick={() => handleQueryChange("")}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {searching ? null : (
          <div className="g-emoji-picker-cats" role="group" aria-label={t("emojiPicker.title")}>
            {CATEGORY_ROW.map((item) => {
              const CategoryIcon = item.icon;
              const label =
                item.id === "recent"
                  ? t("emojiPicker.recent")
                  : t(`emojiPicker.categories.${item.id}`);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="g-emoji-picker-cat"
                  aria-pressed={activeCategory === item.id}
                  aria-label={label}
                  title={label}
                  data-testid={`emoji-picker-category-${item.id}`}
                  onClick={() => jumpToCategory(item.id)}
                >
                  <CategoryIcon size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
        <div className="g-emoji-picker-scrollwrap">
          <div
            ref={scrollRef}
            className="g-emoji-picker-scroll"
            onKeyDown={handleGridKeyDown}
          >
            {content}
          </div>
          <div
            ref={scrollbarRef}
            className="g-emoji-picker-scrollbar"
            aria-hidden="true"
            style={{ display: "none" }}
          >
            <div
              ref={thumbRef}
              className="g-emoji-picker-thumb"
              onPointerDown={onThumbPointerDown}
              onPointerMove={onThumbPointerMove}
              onPointerUp={stopThumbDrag}
              onPointerCancel={stopThumbDrag}
            />
          </div>
        </div>
        </div>
      ) : tab === "stickers" ? (
        <div
          className="g-emoji-picker-body"
          id="g-emoji-picker-panel-stickers"
          role="tabpanel"
          aria-labelledby="g-emoji-picker-tab-stickers"
        >
          <StickersTab
            network={network}
            canSend={canSendStickers ?? true}
            onSend={onSendSticker}
            onToast={onToast}
            autoFocus
          />
        </div>
      ) : (
        <div
          className="g-emoji-picker-body"
          id="g-emoji-picker-panel-gifs"
          role="tabpanel"
          aria-labelledby="g-emoji-picker-tab-gifs"
        >
          <GifsTab
            network={network}
            canSend={canSendGifs ?? true}
            onSend={onSendGif}
            onSendInlineGif={onSendInlineGif}
            onToast={onToast}
            autoFocus
          />
        </div>
      )}

      <div className="g-emoji-picker-footer">
        <div className="g-emoji-picker-tabs" role="tablist" aria-label={t("emojiPicker.title")}>
          {TAB_ORDER.map((tabId) => {
            const TabIcon = TAB_ICONS[tabId];
            const label = t(`emojiPicker.${tabId}`);
            return (
              <button
                key={tabId}
                type="button"
                role="tab"
                id={`g-emoji-picker-tab-${tabId}`}
                className="g-emoji-picker-tab"
                aria-selected={tab === tabId}
                aria-controls={
                  tab === tabId ? `g-emoji-picker-panel-${tabId}` : undefined
                }
                aria-label={label}
                title={label}
                data-testid={`emoji-picker-tab-${tabId}`}
                onClick={() => selectTab(tabId)}
              >
                <TabIcon size={21} strokeWidth={1.7} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="g-emoji-picker-close"
          aria-label={t("emojiPicker.close")}
          title={t("emojiPicker.close")}
          data-testid="emoji-picker-close"
          onClick={close}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {toneMenu ? (
        <EmojiTonePopover
          menu={toneMenu}
          label={t("emojiPicker.skinTone", { defaultValue: "Skin tone" })}
          defaultLabel={t("emojiPicker.skinToneDefault", { defaultValue: "Default" })}
          onSelect={selectTone}
        />
      ) : null}
    </div>
  );
}
