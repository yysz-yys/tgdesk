/**
 * 49 px horizontal set rail for the stickers tab.
 *
 * Telegram Web K: 38×38 cover buttons (30 px cover, 4 px inner padding) at a
 * 48 px pitch (5 px side margins + 10 px gap), the local "Recent" / "Favorites"
 * icon entries first, then one button per installed set (plus a Trending entry
 * when featured sets are shown). Active entry has the primary-text plate; the
 * rail auto-scrolls the active entry to the centre as the content scroll-spy
 * follows the sections. Buttons use `aria-pressed`, not a real tablist.
 *
 * Right-clicking a rail tab opens the set management menu (Add / Archive /
 * Remove) and the Recent tab additionally offers "Clear recent stickers".
 */
import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Heart, Sparkles } from "lucide-react";
import type { StickerSetInfo } from "../../../types";
import {
  StickerSetContextMenu,
  type StickerSetActionRequest,
} from "./StickerSetActions";
import { handlePickerRailKeyDown } from "./gridKeyboard";
import { SetCover } from "./SetCover";

const RECENT_ID = "recent";
const FAVED_ID = "faved";
const TRENDING_ID = "trending";

interface StickerSetRailProps {
  recentCount: number;
  favedCount: number;
  featuredCount: number;
  sets: StickerSetInfo[];
  activeId: string;
  busyRefs: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onNavigateInto: (id: string) => void;
  onSetAction: (request: StickerSetActionRequest) => void;
  onClearRecent: () => void;
}

interface RailIconTabProps {
  id: string;
  activeId: string;
  label: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}

function RailIconTab({ id, activeId, label, onSelect, children }: RailIconTabProps) {
  return (
    <button
      type="button"
      className="g-emoji-picker-set-tab"
      data-rail-id={id}
      tabIndex={activeId === id ? 0 : -1}
      aria-pressed={activeId === id}
      aria-label={label}
      title={label}
      onFocus={() => onSelect(id)}
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  );
}

export function StickerSetRail({
  recentCount,
  favedCount,
  featuredCount,
  sets,
  activeId,
  busyRefs,
  onSelect,
  onNavigateInto,
  onSetAction,
  onClearRecent,
}: StickerSetRailProps) {
  const { t } = useTranslation();
  const railRef = useRef<HTMLDivElement | null>(null);

  // Keep the active entry centred while the content scroll-spy moves.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      return;
    }
    const items = Array.from(
      rail.querySelectorAll<HTMLElement>("[data-rail-id]"),
    );
    const active = items.find((item) => item.dataset.railId === activeId);
    if (!active) {
      return;
    }
    const left = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
    rail.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeId, favedCount, featuredCount, recentCount, sets.length]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handlePickerRailKeyDown(event, () => onNavigateInto(activeId));
  };

  const recentLabel = t("emojiPicker.recentStickers");
  const favedLabel = t("emojiPicker.favoriteStickers");
  const trendingLabel = t("emojiPicker.trendingStickers");

  return (
    <div
      ref={railRef}
      className="g-emoji-picker-set-rail"
      role="group"
      aria-label={t("emojiPicker.stickers")}
      onKeyDown={handleKeyDown}
    >
      {recentCount > 0 ? (
        <StickerSetContextMenu onClearRecent={onClearRecent}>
          {/* A raw button (not the RailIconTab component): Radix' asChild has to
              clone a DOM element to attach the context-menu handlers. */}
          <button
            type="button"
            className="g-emoji-picker-set-tab"
            data-rail-id={RECENT_ID}
            tabIndex={activeId === RECENT_ID ? 0 : -1}
            aria-pressed={activeId === RECENT_ID}
            aria-label={recentLabel}
            title={recentLabel}
            onFocus={() => onSelect(RECENT_ID)}
            onClick={() => onSelect(RECENT_ID)}
          >
            <Clock size={20} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </StickerSetContextMenu>
      ) : null}
      {favedCount > 0 ? (
        <RailIconTab
          id={FAVED_ID}
          activeId={activeId}
          label={favedLabel}
          onSelect={onSelect}
        >
          <Heart size={20} strokeWidth={1.7} aria-hidden="true" />
        </RailIconTab>
      ) : null}
      {sets.map((set) => {
        const countLabel =
          set.count > 0
            ? t("emojiPicker.stickerCount", { count: set.count })
            : "";
        const label = countLabel ? `${set.title} · ${countLabel}` : set.title;
        const busy = busyRefs.has(set.ref);
        return (
          <StickerSetContextMenu
            key={set.ref}
            set={set}
            installed
            busy={busy}
            onAction={onSetAction}
          >
            <button
              type="button"
              className="g-emoji-picker-set-tab g-emoji-picker-set-tab-cover"
              data-rail-id={set.ref}
              tabIndex={activeId === set.ref ? 0 : -1}
              aria-pressed={activeId === set.ref}
              aria-label={label}
              title={label}
              onFocus={() => onSelect(set.ref)}
              onClick={() => onSelect(set.ref)}
            >
              <SetCover set={set} />
            </button>
          </StickerSetContextMenu>
        );
      })}
      {featuredCount > 0 ? (
        <RailIconTab
          id={TRENDING_ID}
          activeId={activeId}
          label={trendingLabel}
          onSelect={onSelect}
        >
          <Sparkles size={20} strokeWidth={1.7} aria-hidden="true" />
        </RailIconTab>
      ) : null}
    </div>
  );
}
