import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { KAvatar } from "./KAvatar";
import { KIcon } from "./KIcon";
import { setTipsIndex, TIPS_COUNT, useTipsState } from "./tipsStore";
import { applyChatTheme, storedThemeId, useActiveTheme, type ChatThemeDTO } from "./themeStore";
import { useRipple } from "./useRipple";
import { Service as AppService } from "../../../bindings/tgdesk/internal/app";

/** Built-in appearance previews for the Appearance tip (see docs/design-k.md). */
interface ThemeTile {
  id: number;
  label: string;
  emoji: string;
  colors: string[];
  top: string;
  bottom: string;
  theme?: ChatThemeDTO;
}

/** Fallback previews if the cloud theme list cannot be fetched yet. */
const FALLBACK_TILES: Omit<ThemeTile, "id">[] = [
  { label: "Day", emoji: "🏠", colors: [], top: "#96c4e4", bottom: "#cfe6f5" },
  { label: "Tinted", emoji: "🐤", colors: [], top: "#8fb87a", bottom: "#d6e7b8" },
  { label: "Night", emoji: "⛄", colors: [], top: "#5f7fa8", bottom: "#a9c4dd" },
  { label: "Pink", emoji: "🌸", colors: [], top: "#e3bcd4", bottom: "#f6dfea" },
];

/** Emoticons shown on the tiles when a theme carries none. */
const TILE_EMOJI = ["🏠", "🐤", "⛄", "💎", "🤓", "🌹", "💜", "🎄", "🎮"];

function intToHex(value: number) {
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
}

interface KChatTipsProps {
  chats: Chat[];
  onOpenChat: (id: string) => void;
  onSettings?: () => void;
  proxyUrl?: string;
  ntp?: string;
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
}: KChatTipsProps) {
  const { t } = useTranslation();
  const { hidden, index } = useTipsState();
  const [suggestMode, setSuggestMode] = useState("installed");
  const [chatFilter, setChatFilter] = useState("popular");
  const [themes, setThemes] = useState<ChatThemeDTO[] | null>(null);
  const activeTheme = useActiveTheme();

  // The cloud themes (account.getThemes through the kernel) fill the Appearance
  // strip with the real Web K set; the stored theme is re-applied on start.
  useEffect(() => {
    if (!proxyUrl) return;
    let alive = true;
    void AppService.GetChatThemes(proxyUrl, ntp ?? "")
      .then((list) => {
        if (!alive) return;
        const mapped = (list ?? []) as ChatThemeDTO[];
        setThemes(mapped);
        const stored = storedThemeId();
        const match = stored === null ? null : mapped.find((theme) => theme.id === stored);
        if (match) applyChatTheme(match);
      })
      .catch(() => {
        // Keep the fallback previews; the strip still explains the feature.
      });
    return () => {
      alive = false;
    };
  }, [proxyUrl, ntp]);

  const themeTiles: ThemeTile[] = useMemo(() => {
    if (themes && themes.length > 0) {
      return themes.map((theme, index) => {
        const colors = (theme.wallpaper?.colors ?? [])
          .filter((value) => typeof value === "number" && value >= 0)
          .map(intToHex);
        return {
          id: theme.id,
          label: theme.title || theme.slug || "",
          emoji: theme.emoticon || TILE_EMOJI[index] || "🏠",
          colors,
          top: colors[0] || "#96c4e4",
          bottom: colors[colors.length - 1] || "#cfe6f5",
          theme,
        };
      });
    }
    return FALLBACK_TILES.map((tile, index) => ({ ...tile, id: -(index + 1) }));
  }, [themes]);

  const selectedTile = activeTheme?.id ?? themeTiles[0]?.id;

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
        {(
          [
            { id: "system", icon: "sputnik_filled", label: t("tips.system") },
            { id: "dark", icon: "darkmode_filled", label: t("tips.dark") },
            { id: "light", icon: "brightness", label: t("tips.light") },
          ] as const
        ).map((button) => {
          const selected = button.id === "light";
          return (
            <button
              key={button.id}
              type="button"
              className={
                selected ? "k-tip-button is-selected" : "k-tip-button"
              }
              aria-pressed={selected}
            >
              <KIcon name={button.icon} className="k-tip-button-icon" />
              <span className="k-tip-button-text">{button.label}</span>
            </button>
          );
        })}
      </div>
      <div className="k-tip-content">
        <div className="k-tip-content-title">{t("tips.colorTheme")}</div>
        <div className="k-tip-themes">
          {themeTiles.map((tile) => {
            const selected = tile.id === selectedTile;
            const from = tile.colors[0] || tile.top;
            const to = tile.colors[tile.colors.length - 1] || tile.bottom;
            return (
              <button
                key={tile.id}
                type="button"
                className={selected ? "k-tip-theme is-selected" : "k-tip-theme"}
                aria-pressed={selected}
                title={tile.label}
                onClick={() => {
                  if (tile.theme) applyChatTheme(tile.theme);
                }}
              >
                <span
                  className="k-tip-theme-preview"
                  style={{
                    background: `linear-gradient(180deg, ${from}, ${to})`,
                  }}
                >
                  <span className="k-tip-theme-bubble is-out" />
                  <span className="k-tip-theme-bubble is-in" />
                  <span className="k-tip-theme-emoticon">{tile.emoji}</span>
                </span>
              </button>
            );
          })}
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

    /* ----- Stickers ----- */
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
              onClick={() => setSuggestMode(button.id)}
            >
              <KIcon name={button.icon} className="k-tip-button-icon" />
              <span className="k-tip-button-text">{button.label}</span>
            </button>
          );
        })}
      </div>
      <div className="k-tip-content">
        <div className="k-tip-content-title">{t("tips.trending")}</div>
        <div className="k-tip-empty">{t("tips.stickersEmpty")}</div>
      </div>
      <div className="k-tip-description">{t("tips.stickersDescription")}</div>
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
