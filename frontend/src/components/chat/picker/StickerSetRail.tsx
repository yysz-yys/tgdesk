/**
 * 49 px horizontal set rail for the stickers tab.
 *
 * Telegram Web K: 38×38 cover buttons (32 px cover, 4 px inner padding) at a
 * 48 px pitch (5 px side margins + 10 px gap), local "Recent" icon entry first,
 * then one button per installed set. Active entry has the primary-text 6% plate;
 * the rail auto-scrolls the active entry to the centre as the content scroll-spy
 * follows the sections. Buttons use `aria-pressed`, not a real tablist.
 */
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Sticker } from "lucide-react";
import type { StickerSetInfo } from "../../../types";
import { handlePickerRailKeyDown } from "./gridKeyboard";

const RECENT_ID = "recent";

interface StickerSetRailProps {
  recentCount: number;
  sets: StickerSetInfo[];
  activeId: string;
  onSelect: (id: string) => void;
  onNavigateInto: (id: string) => void;
}

function RailCover({ set }: { set: StickerSetInfo }) {
  const [failed, setFailed] = useState(false);
  const animatedCover = set.coverKind === "tgs" || set.coverKind === "webm";

  useEffect(() => {
    setFailed(false);
  }, [set.coverUrl]);

  if (set.coverUrl && !animatedCover && !failed) {
    return (
      <img
        src={set.coverUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  const initial = set.title.trim().slice(0, 1).toUpperCase();
  return (
    <span className="g-emoji-picker-set-initial" aria-hidden="true">
      {initial || <Sticker size={16} strokeWidth={1.7} />}
    </span>
  );
}

export function StickerSetRail({
  recentCount,
  sets,
  activeId,
  onSelect,
  onNavigateInto,
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
  }, [activeId, recentCount, sets.length]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handlePickerRailKeyDown(event, () => onNavigateInto(activeId));
  };

  return (
    <div
      ref={railRef}
      className="g-emoji-picker-set-rail"
      role="group"
      aria-label={t("emojiPicker.stickers")}
      onKeyDown={handleKeyDown}
    >
      {recentCount > 0 ? (
        <button
          type="button"
          className="g-emoji-picker-set-tab"
          data-rail-id={RECENT_ID}
          tabIndex={activeId === RECENT_ID ? 0 : -1}
          aria-pressed={activeId === RECENT_ID}
          aria-label={t("emojiPicker.recentStickers")}
          title={t("emojiPicker.recentStickers")}
          onFocus={() => onSelect(RECENT_ID)}
          onClick={() => onSelect(RECENT_ID)}
        >
          <Clock size={20} strokeWidth={1.7} aria-hidden="true" />
        </button>
      ) : null}
      {sets.map((set) => {
        const countLabel =
          set.count > 0
            ? t("emojiPicker.stickerCount", { count: set.count })
            : "";
        const label = countLabel ? `${set.title} · ${countLabel}` : set.title;
        return (
          <button
            key={set.ref}
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
            <RailCover set={set} />
          </button>
        );
      })}
    </div>
  );
}
