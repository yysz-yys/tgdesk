/**
 * Server sticker-search results (Telegram Web K's `messages.searchStickers`).
 *
 * Layout: one flat 5-column grid of every returned sticker (Web K renders the
 * search hits as a single category), followed by a "Sticker Packs" block listing
 * the sets the hits belong to so a non-installed set can be added inline.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StickerDoc, StickerSearch, StickerSetInfo } from "../../../types";
import {
  PickerLoadingAnnouncement,
  PickerState,
  StickerGridSkeleton,
} from "./PickerStates";
import { StickerCell } from "./StickerCell";
import { StickerSetRowList } from "./StickerSetRowList";
import { handlePickerGridKeyDown } from "./gridKeyboard";

export interface StickerSearchResultsProps {
  query: string;
  data: StickerSearch | undefined;
  loading: boolean;
  error: unknown;
  favedIds: ReadonlySet<string>;
  pendingIds: ReadonlySet<string>;
  installedIds: ReadonlySet<string>;
  busySetRefs: ReadonlySet<string>;
  onRetry: () => void;
  onSend: (doc: StickerDoc) => void;
  onToggleFaved: (doc: StickerDoc) => void;
  onInstallSet: (set: StickerSetInfo) => void;
  onPreviewStart: (doc: StickerDoc, anchor: HTMLElement) => void;
  onPreviewEnd: () => void;
  /** ArrowUp on the first row returns to the search field. */
  onEscapeToSearch: () => void;
}

function docKey(doc: StickerDoc): string {
  return doc.id || doc.ref;
}

function uniqueDocs(docs: readonly StickerDoc[]): StickerDoc[] {
  const seen = new Set<string>();
  const result: StickerDoc[] = [];
  for (const doc of docs) {
    const key = docKey(doc);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(doc);
  }
  return result;
}

export function StickerSearchResults({
  query,
  data,
  loading,
  error,
  favedIds,
  pendingIds,
  installedIds,
  busySetRefs,
  onRetry,
  onSend,
  onToggleFaved,
  onInstallSet,
  onPreviewStart,
  onPreviewEnd,
  onEscapeToSearch,
}: StickerSearchResultsProps) {
  const { t } = useTranslation();
  const [focusedIndex, setFocusedIndex] = useState(0);

  const stickers = useMemo(() => uniqueDocs(data?.stickers ?? []), [data]);
  const sets = data?.sets ?? [];

  useEffect(() => {
    setFocusedIndex(0);
  }, [query, data]);

  if (!data && loading) {
    return (
      <>
        <PickerLoadingAnnouncement text={t("emojiPicker.loadingStickers")} />
        <StickerGridSkeleton count={15} />
      </>
    );
  }
  if (!data && error) {
    return (
      <PickerState
        text={t("emojiPicker.searchFailed")}
        action={{ label: t("common.retry"), onClick: onRetry }}
      />
    );
  }
  if (stickers.length === 0 && sets.length === 0) {
    return <PickerState text={t("emojiPicker.noStickersFound")} />;
  }

  const activeIndex = stickers.length === 0 ? 0 : Math.min(focusedIndex, stickers.length - 1);

  return (
    <div
      className="g-emoji-picker-sticker-search-results"
      data-query={query}
      data-loading={loading || undefined}
    >
      {stickers.length > 0 ? (
        <section className="g-emoji-picker-sticker-section">
          <div
            className="g-emoji-picker-sticker-section-title"
            role="heading"
            aria-level={3}
            data-section-header="true"
          >
            <span className="g-emoji-picker-sticker-section-title-text">
              {t("emojiPicker.searchResults")}
            </span>
          </div>
          <div
            className="g-emoji-picker-sticker-grid"
            data-picker-grid="true"
            role="group"
            aria-label={t("emojiPicker.searchResults")}
            onKeyDown={(event) => handlePickerGridKeyDown(event, onEscapeToSearch)}
          >
            {stickers.map((doc, index) => (
              <StickerCell
                key={docKey(doc)}
                doc={doc}
                index={index}
                tabbable={index === activeIndex}
                pending={pendingIds.has(docKey(doc))}
                faved={favedIds.has(docKey(doc))}
                onToggleFaved={onToggleFaved}
                onSend={onSend}
                onFocusCell={setFocusedIndex}
                onPreviewStart={onPreviewStart}
                onPreviewEnd={onPreviewEnd}
              />
            ))}
          </div>
        </section>
      ) : null}
      <StickerSetRowList
        title={t("emojiPicker.stickerPacks")}
        sets={sets}
        installedIds={installedIds}
        busyRefs={busySetRefs}
        onInstall={onInstallSet}
      />
    </div>
  );
}
