import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { Chat, StickerDoc, StickerSetInfo } from "../../types";
import type { ThemePreference } from "../../hooks/useTheme";
import type { StickerSuggestMode } from "../../hooks/useSettings";
import {
  loadFeaturedStickerSets,
  loadStickerSet,
  type PickerNetwork,
} from "../../lib/stickerApi";
import { KAvatar } from "./KAvatar";
import { KIcon } from "./KIcon";
import { KStickerMedia } from "./KStickerMedia";
import { openStickerPopup } from "./stickerPopupStore";
import { setTipsIndex, TIPS_COUNT, useTipsState } from "./tipsStore";
import {
  applyChatTheme,
  DEFAULT_PATTERN_URL,
  DEFAULT_WALLPAPER,
  resetChatTheme,
  storedThemeId,
  themeColorsHex,
  themeVariant,
  useActiveTheme,
  variantAccentHex,
  variantColors,
  type ChatThemeDTO,
} from "./themeStore";
import {
  DEFAULT_TILE_THEME,
  FALLBACK_GLOBAL_THEMES,
  mergeLiveGlobalThemes,
} from "./globalThemes";
import { KThemeEmoticon, type KThemeEmoticonHandle } from "./KThemeEmoticon";
import { KThemeTileMask } from "./KThemeTileMask";
import { bundledThemeEmoji } from "./themeEmojiAssets";
import {
  preloadThemeEmoji,
  preloadThemeEmojiRenderer,
  readCachedEmojiRefs,
  saveCachedEmojiRefs,
} from "./themeEmojiCache";
import { useRipple } from "./useRipple";
import { Service as AppService } from "../../../bindings/tgdesk/internal/app";

/** The miniature chat drawn on one theme tile (tweb `.theme-container`). */
interface ThemePreview {
  /** Diagonal of the wallpaper's four gradient stops, bottom-right → top-left. */
  wallpaper: string;
  /** Doodle pattern SVG: the theme's own, else the bundled factory one. */
  patternUrl: string;
  /** |wallPaperSettings.intensity| / 100. */
  patternOpacity: number;
  /** Dark wallpapers draw their black-on-transparent doodles inverted. */
  patternInvert: boolean;
  /** /
   * The reference's two wallpaper renders (tweb chatBackground): the light/tinted
   * overlay (gradient + soft-light doodles) or the Night mask (a black plate with
   * the doodles punched out over the dimmed gradient).
   */
  render: "overlay" | "mask";
  /** Mask render: how much of the gradient shows through the doodles. */
  maskOpacity: number;
  /** Mask render: the wallpaper's four gradient stops (canvas needs them). */
  stops: string[];
  /** The outgoing bubble: the theme's message gradient, else its accent. */
  outBubble: string;
  night: boolean;
}

interface ThemeTile {
  theme: ChatThemeDTO;
  selected: boolean;
  /** Accessible name: the theme emoticon + title, or the factory tile's name. */
  label: string;
  preview: ThemePreview;
  /** Loopback Lottie URL of the theme's animated-emoji figure, if the kernel served one. */
  emoticonUrl?: string;
  /** Sticker ref id remembered from an earlier launch (cache key before URLs arrive). */
  emoticonRef?: string;
}

/**
 * A theme tile's name: its emoticon and title, without saying the emoticon twice
 * (the server's theme titles already start with it, e.g. "🐥 Chat Theme").
 */
function themeName(theme: ChatThemeDTO, fallback: string) {
  const emoticon = theme.emoticon?.trim();
  const title = theme.title?.trim();
  if (!title) return emoticon || fallback;
  if (!emoticon || title.includes(emoticon)) return title;
  return `${emoticon} ${title}`;
}

/**
 * The 72×96 miniature chat tweb draws for a cloud theme (`scss/partials/_themes.scss`):
 * the variant's wallpaper gradient + doodle pattern, one outgoing bubble in the
 * theme's message gradient, one incoming bubble and the theme's emoticon.
 */
function themePreview(theme: ChatThemeDTO, night: boolean): ThemePreview {
  const settings = themeVariant(theme, night ? "night" : "day");
  const wallpaper = settings?.wallpaper;
  const colors = variantColors(settings);
  const stops = colors.length > 1 ? colors : DEFAULT_WALLPAPER.colors;
  const messageColors = themeColorsHex(settings?.messageColors);
  const accent = variantAccentHex(settings);
  return {
    // The reference paints its freeform canvas; at 72×96 a diagonal through the
    // same four stops reads the same and costs no canvas per tile.
    wallpaper: `linear-gradient(315deg, ${stops.join(", ")})`,
    patternUrl: wallpaper?.patternUrl || DEFAULT_PATTERN_URL,
    patternOpacity: Math.max(
      0,
      Math.min(1, Math.abs(wallpaper?.intensity ?? 50) / 100),
    ),
    patternInvert: Boolean(wallpaper?.dark),
    render: night && Boolean(wallpaper?.dark) ? "mask" : "overlay",
    // tweb dims the mask-path gradient to max(.3, |intensity| / 2).
    maskOpacity: Math.max(
      0.3,
      Math.min(1, Math.abs(wallpaper?.intensity ?? 50) / 200),
    ),
    stops,
    outBubble:
      messageColors.length > 1
        ? `linear-gradient(135deg, ${messageColors[messageColors.length - 1]}, ${messageColors[0]})`
        : messageColors[0] ?? accent ?? "var(--primary-color)",
    night,
  };
}

interface KChatTipsProps {
  chats: Chat[];
  onOpenChat: (id: string) => void;
  onSettings?: () => void;
  proxyUrl?: string;
  ntp?: string;
  themePreference: ThemePreference;
  onThemePreferenceChange: (
    preference: ThemePreference,
    point?: { x: number; y: number },
  ) => void;
  /** The brightness the app currently resolves to (system included). */
  resolvedNight: boolean;
  /** tweb appSettings `stickers.suggest` — the Stickers card's segmented row. */
  stickerSuggest?: StickerSuggestMode;
  onStickerSuggestChange?: (mode: StickerSuggestMode) => void;
  /** The description's "Trending Stickers" link (the reference opens the
   * Stickers-and-Emoji settings screen). */
  onOpenTrending?: () => void;
  /** False when the app runs with animations disabled (tweb lite mode 0). */
  animationsEnabled?: boolean;
}

/**
 * The empty-chat tips deck (tweb components/chatTips): a 320×320 card in the
 * middle of the column, a row of segmented buttons inside it, and the Previous /
 * Next pills under it. The cards are all mounted and cross-fade/slide in place;
 * the deck collapses (scale .1 + fade) to the "select a chat" pill with the
 * corner toggle. Three tips: Appearance, Stickers, Chats.
 */
export function KChatTips({
  chats,
  onOpenChat,
  onSettings,
  proxyUrl,
  ntp,
  themePreference,
  onThemePreferenceChange,
  resolvedNight,
  stickerSuggest,
  onStickerSuggestChange,
  onOpenTrending,
  animationsEnabled = true,
}: KChatTipsProps) {
  const { t } = useTranslation();
  const { hidden, index } = useTipsState();
  const [localSuggestMode, setLocalSuggestMode] =
    useState<StickerSuggestMode>("all");
  const suggestMode = stickerSuggest ?? localSuggestMode;
  const [chatFilter, setChatFilter] = useState("popular");
  const [themes, setThemes] = useState<ChatThemeDTO[] | null>(null);
  const [emoticonUrls, setEmoticonUrls] = useState<Record<string, string>>({});
  // The Stickers card's Trending row (tweb `stickersCard`): the featured packs
  // plus the first document of each pack, which is what the reference paints as
  // the looping 88px cover.
  const [featuredSets, setFeaturedSets] = useState<StickerSetInfo[] | null>(null);
  const [featuredCovers, setFeaturedCovers] = useState<Record<string, StickerDoc>>(
    {},
  );
  const network = useMemo<PickerNetwork | null>(
    () =>
      proxyUrl === undefined ? null : { proxy: proxyUrl, ntp: ntp ?? "" },
    [ntp, proxyUrl],
  );
  // Sticker ref ids remembered from an earlier launch: they let the tiles draw
  // their figures from the IndexedDB cache before the kernel's animated-emoji
  // metadata arrives (the URLs themselves carry a new token every launch).
  const [cachedEmoticonRefs, setCachedEmoticonRefs] =
    useState<Record<string, string>>(() => readCachedEmojiRefs());
  const activeTheme = useActiveTheme();
  const stripRef = useRef<HTMLDivElement>(null);
  const figureHandles = useRef(new Map<number, KThemeEmoticonHandle>());
  const playingEmoticon = useRef<KThemeEmoticonHandle | null>(null);

  // The cloud themes (account.getChatThemes through the kernel) fill the
  // Appearance strip with the real Web K set; the bundled table covers the time
  // before the kernel answers and every failure. The stored theme is re-applied
  // on start — from the bundled table first so the wallpaper settles at once,
  // and again against the live list once it arrives.
  useEffect(() => {
    let alive = true;

    const restoreStored = (list: ChatThemeDTO[]) => {
      const stored = storedThemeId();
      if (stored === null) return;
      const match = list.find((theme) => theme.id === stored);
      if (match) applyChatTheme(match);
    };

    // Restore the persisted theme from the bundled table at once, even without
    // the kernel (dev preview), so the accent/wallpaper settle before the live
    // list answers.
    restoreStored(FALLBACK_GLOBAL_THEMES);

    // `undefined` means the dev preview page (no Wails runtime / kernel); an
    // empty string is a real app with a direct connection and still fetches.
    if (proxyUrl === undefined) {
      return () => {
        alive = false;
      };
    }

    try {
      void AppService.GetChatThemes(proxyUrl, ntp ?? "")
        .then((list) => {
          if (!alive) return;
          const mapped = mergeLiveGlobalThemes(
            (list ?? []) as ChatThemeDTO[],
          );
          if (mapped.length === 0) return;
          setThemes(mapped);
          restoreStored(mapped);
        })
        .catch(() => {
          // Keep the bundled table; the strip still explains the feature.
        });
    } catch {
      // No Wails runtime (the dev preview page) — the bundled table is enough.
    }

    return () => {
      alive = false;
    };
  }, [proxyUrl, ntp]);

  // The tiles' figures are Telegram's animated emoji (one TGS/Lottie file each).
  // The stock ones ship with the app and load instantly; only an emoticon with
  // no bundled file needs the kernel's animated-emoji endpoint.
  const emoticonList = useMemo(
    () =>
      Array.from(
        new Set(
          [DEFAULT_TILE_THEME, ...(themes ?? FALLBACK_GLOBAL_THEMES)]
            .map((theme) => theme.emoticon)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [themes],
  );

  // Emoticons the app does not carry a figure for: the kernel's live set is the
  // only source, and its answer is cached for the next launches.
  const kernelEmoticons = useMemo(
    () => emoticonList.filter((emoticon) => !bundledThemeEmoji(emoticon)),
    [emoticonList],
  );

  useEffect(() => {
    if (proxyUrl === undefined || kernelEmoticons.length === 0) return;
    let alive = true;
    try {
      void AppService.GetAnimatedEmojiStickers(
        proxyUrl,
        ntp ?? "",
        kernelEmoticons,
      )
        .then((list) => {
          if (!alive) return;
          const next: Record<string, string> = {};
          for (const item of list ?? []) {
            if (item?.url) next[item.emoticon] = item.url;
          }
          setEmoticonUrls(next);
          saveCachedEmojiRefs(next);
          setCachedEmoticonRefs(readCachedEmojiRefs());
        })
        .catch(() => {
          // Keep the plain emoji glyphs; the strip still shows every theme.
        });
    } catch {
      // No Wails runtime (the dev preview page).
    }
    return () => {
      alive = false;
    };
  }, [proxyUrl, ntp, kernelEmoticons]);

  // The Stickers card's Trending row. tweb fetches `messages.getFeaturedStickers`
  // when the deck mounts and, per pack, the full set to find the cover sticker
  // (only the pack headers are cached by the featured read). Here the fetch waits
  // until the deck is open: the deck is always mounted in the empty column, and a
  // collapsed deck has no business hitting the sticker API right at sign-in.
  useEffect(() => {
    if (!network || hidden) {
      return;
    }
    let alive = true;
    void loadFeaturedStickerSets(network)
      .then((sets) => {
        if (!alive) return;
        const top = sets.slice(0, 3);
        setFeaturedSets(top);
        for (const set of top) {
          void loadStickerSet(network, set.ref)
            .then((detail) => {
              if (!alive) return;
              const cover = detail.stickers[0];
              if (!cover) return;
              setFeaturedCovers((current) =>
                current[set.ref] ? current : { ...current, [set.ref]: cover },
              );
            })
            .catch(() => {
              // The pack's own cover (when the header carries one) stays.
            });
        }
      })
      .catch(() => {
        if (alive) {
          setFeaturedSets([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [hidden, network]);

  // Warm the bundled figures and the lottie renderer while the page is idle: the
  // deck then paints finished figures (no frame of the fallback glyph) and the
  // first click animates at once, rather than paying for the module and TGS
  // parsing on the click that needs them.
  useEffect(() => {
    if (emoticonList.length === 0) return;
    let timer = 0;
    let idle = 0;
    const warm = () => {
      void preloadThemeEmojiRenderer();
      void preloadThemeEmoji(emoticonList);
    };
    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(warm, { timeout: 1500 });
    } else {
      timer = window.setTimeout(warm, 250);
    }
    return () => {
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, [emoticonList]);

  // A vertical mouse wheel scrolls the theme strip sideways, the way the
  // reference's scroll container does. Native listener: React's wheel handler
  // is passive, so it could not prevent the page's own scroll.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  // Nine tiles: the factory "no custom theme" one, then the global themes. The
  // active id comes from the theme store (null = the factory tile); the variant
  // each card previews follows the resolved appearance, as in the reference.
  const activeThemeId = activeTheme?.id ?? 0;
  const themeTiles: ThemeTile[] = [
    DEFAULT_TILE_THEME,
    ...(themes ?? FALLBACK_GLOBAL_THEMES),
  ].map((theme) => {
    const isFactory = theme.id === 0;
    return {
      theme,
      selected: theme.id === activeThemeId,
      label: isFactory
        ? theme.emoticon || t("tips.light")
        : themeName(theme, t("tips.colorTheme")),
      preview: themePreview(theme, resolvedNight),
      emoticonUrl: theme.emoticon ? emoticonUrls[theme.emoticon] : undefined,
      emoticonRef: theme.emoticon
        ? cachedEmoticonRefs[theme.emoticon]
        : undefined,
    };
  });

  const themePreferences = [
    { id: "system", icon: "sputnik_filled", label: t("tips.system") },
    { id: "dark", icon: "darkmode_filled", label: t("tips.dark") },
    { id: "light", icon: "brightness", label: t("tips.light") },
  ] as const;

  const offsetOf = (i: number) =>
    (i - index + TIPS_COUNT) % TIPS_COUNT === 1 ? "50px" : "-50px";

  const recentChats = chats
    .filter((chat) => !chat.archived)
    .slice(0, 8);

  const modeButtons = [
    { id: "none", icon: "stop", label: t("tips.suggestNone") },
    { id: "installed", icon: "newprivate", label: t("tips.suggestInstalled") },
    { id: "all", icon: "stickers_face", label: t("tips.suggestAll") },
  ] as const;

  const cards = [
    /* ----- Appearance ----- */
    <div className="k-tip-card" role="group" aria-labelledby="k-tip-appearance">
      <div className="k-tip-card-title" id="k-tip-appearance">
        {t("tips.appearance")}
      </div>
      <div className="k-tip-buttons" role="toolbar">
        {themePreferences.map((button) => {
          const selected = button.id === themePreference;
          return (
            <button
              key={button.id}
              type="button"
              className={
                selected ? "k-tip-button is-selected" : "k-tip-button"
              }
              aria-pressed={selected}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onThemePreferenceChange(button.id, {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                });
              }}
            >
              <KIcon name={button.icon} className="k-tip-button-icon" />
              <span className="k-tip-button-text">{button.label}</span>
            </button>
          );
        })}
      </div>
      <div className="k-tip-content">
        <div className="k-tip-content-title">{t("tips.colorTheme")}</div>
        <div
          className="k-tip-themes"
          role="toolbar"
          aria-label={t("tips.colorTheme")}
          ref={stripRef}
        >
          {themeTiles.map((tile) => (
            <button
              key={tile.theme.id}
              type="button"
              className={
                tile.selected ? "k-tip-theme is-selected" : "k-tip-theme"
              }
              aria-pressed={tile.selected}
              aria-label={tile.label}
              title={tile.label}
              onClick={() => {
                // Play the tile figure's micro-animation for the new pick,
                // cancelling one still running on another tile, then apply the
                // theme — the reference starts both on the same click.
                const figure =
                  figureHandles.current.get(tile.theme.id) ?? null;
                if (
                  playingEmoticon.current &&
                  playingEmoticon.current !== figure
                ) {
                  playingEmoticon.current.cancel();
                }
                playingEmoticon.current = figure;
                figure?.play();
                if (tile.theme.id === 0) {
                  resetChatTheme();
                } else {
                  applyChatTheme(tile.theme);
                }
              }}
            >
              <span
                className={
                  tile.preview.night
                    ? "k-tip-theme-preview is-night"
                    : "k-tip-theme-preview"
                }
                style={{
                  background:
                    tile.preview.render === "mask"
                      ? "#000000"
                      : tile.preview.wallpaper,
                }}
              >
                {tile.preview.render === "mask" ? (
                  // The Night mask render: the gradient only shows through the
                  // doodle lines, dimmed over a black plate (tweb chatBackground).
                  <KThemeTileMask
                    colors={tile.preview.stops}
                    patternUrl={tile.preview.patternUrl}
                    opacity={tile.preview.maskOpacity}
                    enabled={!hidden}
                  />
                ) : (
                  <img
                    className="k-tip-theme-pattern"
                    src={tile.preview.patternUrl}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    style={{
                      opacity: tile.preview.patternOpacity,
                      filter: tile.preview.patternInvert
                        ? "invert(1)"
                        : undefined,
                    }}
                  />
                )}
                <span
                  className="k-tip-theme-bubble is-out"
                  style={{ background: tile.preview.outBubble }}
                />
                <span className="k-tip-theme-bubble is-in" />
                {tile.theme.emoticon ? (
                  <KThemeEmoticon
                    ref={(handle) => {
                      if (handle) {
                        figureHandles.current.set(tile.theme.id, handle);
                      } else {
                        figureHandles.current.delete(tile.theme.id);
                      }
                    }}
                    emoticon={tile.theme.emoticon}
                    // The figures are only painted while the deck is open; the
                    // bundled ones load from local assets the moment it opens.
                    url={tile.emoticonUrl}
                    cacheRef={tile.emoticonRef}
                    enabled={!hidden}
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="k-tip-description">
        <Trans
          i18nKey="tips.appearanceDescription"
          components={{
            settings: (
              <button
                type="button"
                className="k-tip-link"
                onClick={() => onSettings?.()}
              />
            ),
          }}
        />
      </div>
    </div>,

    /* ----- Stickers (tweb components/chatTips/stickersCard.tsx) ----- */
    <div className="k-tip-card" role="group" aria-labelledby="k-tip-stickers">
      <div className="k-tip-card-title" id="k-tip-stickers">
        {t("tips.stickersTitle")}
      </div>
      <div className="k-tip-buttons" role="toolbar">
        {modeButtons.map((button) => {
          const selected = suggestMode === button.id;
          return (
            <button
              key={button.id}
              type="button"
              className={
                selected ? "k-tip-button is-selected" : "k-tip-button"
              }
              aria-pressed={selected}
              onClick={() => {
                setLocalSuggestMode(button.id);
                onStickerSuggestChange?.(button.id);
              }}
            >
              <KIcon name={button.icon} className="k-tip-button-icon" />
              <span className="k-tip-button-text">{button.label}</span>
            </button>
          );
        })}
      </div>
      <div className="k-tip-content">
        <div className="k-tip-content-title">{t("tips.trending")}</div>
        {featuredSets === null ? (
          <div className="k-tip-sticker-sets" aria-hidden="true">
            {[0, 1, 2].map((slot) => (
              <span key={slot} className="k-tip-sticker-set">
                <span className="k-tip-sticker-set-cover k-tip-sticker-skeleton" />
              </span>
            ))}
          </div>
        ) : featuredSets.length > 0 ? (
          <div className="k-tip-sticker-sets">
            {featuredSets.map((set) => {
              const cover = featuredCovers[set.ref];
              return (
                <button
                  key={set.ref}
                  type="button"
                  className="k-tip-sticker-set"
                  aria-label={set.title}
                  title={set.title}
                  onClick={() => openStickerPopup(set)}
                >
                  <span className="k-tip-sticker-set-cover">
                    {cover ? (
                      <KStickerMedia
                        doc={cover}
                        enabled={!hidden && animationsEnabled}
                        withLock
                      />
                    ) : set.coverUrl &&
                      set.coverKind !== "tgs" &&
                      set.coverKind !== "webm" ? (
                      <img
                        src={set.coverUrl}
                        alt=""
                        draggable={false}
                        decoding="async"
                      />
                    ) : null}
                  </span>
                  <span className="k-tip-sticker-set-name">{set.title}</span>
                </button>
              );
            })}
          </div>
        ) : (
          // tweb renders nothing when the featured read failed or came back
          // empty; the content title stays, the row is blank.
          <div className="k-tip-sticker-sets" aria-hidden="true" />
        )}
      </div>
      <div className="k-tip-description k-tip-description-two-lines">
        <Trans
          i18nKey="tips.stickersDescription"
          components={{
            trending: (
              <button
                type="button"
                className="k-tip-link"
                onClick={() => onOpenTrending?.()}
              />
            ),
          }}
        />
      </div>
    </div>,

    /* ----- Chats ----- */
    <div className="k-tip-card" role="group" aria-labelledby="k-tip-chats">
      <div className="k-tip-card-title" id="k-tip-chats">
        {t("tips.chatsTitle")}
      </div>
      <div className="k-tip-buttons" role="toolbar">
        {(
          [
            {
              id: "popular",
              icon: "newprivate",
              label: t("tips.chatsPopular"),
            },
          ] as const
        ).map((button) => {
          const selected = chatFilter === button.id;
          return (
            <button
              key={button.id}
              type="button"
              className={
                selected ? "k-tip-button is-selected" : "k-tip-button"
              }
              aria-pressed={selected}
              onClick={() => setChatFilter(button.id)}
            >
              <KIcon name={button.icon} className="k-tip-button-icon" />
              <span className="k-tip-button-text">{button.label}</span>
            </button>
          );
        })}
      </div>
      <div className="k-tip-content">
        {recentChats.length > 0 ? (
          <div className="k-tip-peers">
            {recentChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className="k-tip-peer"
                onClick={() => onOpenChat(chat.id)}
              >
                <KAvatar chat={chat} size={40} />
                <span className="k-tip-peer-name">{chat.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="k-tip-empty">{t("tips.chatsEmpty")}</div>
        )}
      </div>
      <div className="k-tip-description">{t("tips.chatsDescription")}</div>
    </div>,
  ];

  return (
    <div className="k-chat-tips-host">
      <div
        className={hidden ? "k-chat-tips-carousel is-hidden" : "k-chat-tips-carousel"}
      >
        <div className="k-chat-tips-stage">
          {cards.map((card, i) => (
            <div
              key={i}
              className={
                i === index ? "k-chat-tips-slot is-active" : "k-chat-tips-slot"
              }
              style={{ "--tip-slide": offsetOf(i) } as React.CSSProperties}
            >
              {card}
            </div>
          ))}
        </div>
        <div className="k-chat-tips-nav">
          <TipNavButton
            icon="arrow_prev"
            label={t("tips.previous")}
            onClick={() => setTipsIndex(index - 1)}
          />
          <TipNavButton
            icon="arrow_next"
            iconAfter
            label={t("tips.next")}
            onClick={() => setTipsIndex(index + 1)}
          />
        </div>
      </div>
    </div>
  );
}

function TipNavButton({
  icon,
  label,
  iconAfter,
  onClick,
}: {
  icon: Parameters<typeof KIcon>[0]["name"];
  label: string;
  iconAfter?: boolean;
  onClick: () => void;
}) {
  const ripple = useRipple<HTMLButtonElement>();
  return (
    <button
      ref={ripple.ref}
      type="button"
      className="k-chat-tips-nav-button"
      onClick={onClick}
    >
      {iconAfter ? null : <KIcon name={icon} className="button-icon" />}
      <span>{label}</span>
      {iconAfter ? <KIcon name={icon} className="button-icon" /> : null}
    </button>
  );
}
