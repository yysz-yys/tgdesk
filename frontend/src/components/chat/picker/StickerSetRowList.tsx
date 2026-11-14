/**
 * Vertical list of sticker sets for the search-results "Sticker Packs" block and
 * the Trending section: cover, title, sticker count and the Add affordance for
 * sets that are not installed yet.
 *
 * The install call itself lives in StickersTab (kernel + cache invalidation + a
 * toast); this component is presentational plus the busy/label state.
 */
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StickerSetInfo } from "../../../types";
import { SetCover } from "./SetCover";

export interface StickerSetRowListProps {
  title: string;
  sets: StickerSetInfo[];
  /** Set ids already installed (packs may lag behind an install RPC). */
  installedIds: ReadonlySet<string>;
  /** Set refs with an install/remove/archive RPC in flight. */
  busyRefs: ReadonlySet<string>;
  onInstall: (set: StickerSetInfo) => void;
  /** Section id for the rail scroll-spy (omitted for the search block). */
  sectionId?: string;
}

export function StickerSetRowList({
  title,
  sets,
  installedIds,
  busyRefs,
  onInstall,
  sectionId,
}: StickerSetRowListProps) {
  const { t } = useTranslation();
  if (sets.length === 0) {
    return null;
  }
  return (
    <section
      className="g-emoji-picker-set-section"
      data-section-id={sectionId}
    >
      <div
        className="g-emoji-picker-sticker-section-title"
        role="heading"
        aria-level={3}
        data-section-header="true"
      >
        <span className="g-emoji-picker-sticker-section-title-text">{title}</span>
      </div>
      <ul className="g-emoji-picker-set-rows">
        {sets.map((set) => {
          const installed = set.installed === true || installedIds.has(set.id);
          const busy = busyRefs.has(set.ref);
          return (
            <li key={set.ref} className="g-emoji-picker-set-row" data-set-row={set.ref}>
              <SetCover set={set} className="g-emoji-picker-set-row-cover" />
              <span className="g-emoji-picker-set-row-body">
                <span className="g-emoji-picker-set-row-title" title={set.title}>
                  {set.title}
                </span>
                {set.count > 0 ? (
                  <span className="g-emoji-picker-set-row-count">
                    {t("emojiPicker.stickerCount", { count: set.count })}
                  </span>
                ) : null}
              </span>
              {installed ? (
                <span className="g-emoji-picker-set-row-state">
                  {t("emojiPicker.installedSet")}
                </span>
              ) : (
                <button
                  type="button"
                  className="g-emoji-picker-set-row-add"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  onClick={() => onInstall(set)}
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                  <span>
                    {busy
                      ? t("emojiPicker.installingSet")
                      : t("emojiPicker.installSet")}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
