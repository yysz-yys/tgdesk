/**
 * One section of the stickers tab: a centred Telegram-style category title plus
 * a 5-column grid of 72 px cells.
 *
 * The "recent" / "favorites" rows are sections with ready-made `documents` and
 * their own header actions (clear recent); installed sets pass a `set` and are
 * fetched lazily the first time the section scrolls near the viewport (the root
 * is the picker's own scroll container, 200 px margin, as in Web K's
 * VisibilityIntersector). While a set loads the skeleton renders exactly
 * `set.count` cells, which pre-reserves the final height so the custom
 * scrollbar does not jump as sections stream in.
 *
 * Headers are right-click/context-menu targets for the set management actions
 * and expose the same actions through a hover "more" button.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StickerDoc, StickerSetInfo } from "../../../types";
import type { PickerNetwork } from "../../../lib/stickerApi";
import { StickerCell } from "./StickerCell";
import {
  PickerState,
  StickerGridSkeleton,
} from "./PickerStates";
import {
  StickerSetContextMenu,
  StickerSetMoreMenu,
  type StickerSetActionRequest,
} from "./StickerSetActions";
import { handlePickerGridKeyDown } from "./gridKeyboard";
import { useStickerSet } from "./useStickerSet";

export interface StickerSetSectionProps {
  sectionId: string;
  title: string;
  /** Ready documents (recent/favorites rows). Mutually exclusive with `set`. */
  documents?: StickerDoc[];
  /** Installed set lazy-fetched when the section becomes visible. */
  set?: StickerSetInfo;
  network?: PickerNetwork;
  canSend: boolean;
  pendingIds: ReadonlySet<string>;
  favedIds?: ReadonlySet<string>;
  busy?: boolean;
  onSend: (doc: StickerDoc) => void;
  onToggleFaved?: (doc: StickerDoc) => void;
  onFocusRail: () => void;
  onPreviewStart: (doc: StickerDoc, anchor: HTMLElement) => void;
  onPreviewEnd: () => void;
  /** Set management (installed set sections only). */
  onSetAction?: (request: StickerSetActionRequest) => void;
  /** Clear-recent action (recent section only). */
  onClearRecent?: () => void;
}

const SKELETON_CELL_CAP = 120;

function docKey(doc: StickerDoc): string {
  return doc.id || doc.ref;
}

export function StickerSetSection({
  sectionId,
  title,
  documents,
  set,
  network,
  canSend,
  pendingIds,
  favedIds,
  busy = false,
  onSend,
  onToggleFaved,
  onFocusRail,
  onPreviewStart,
  onPreviewEnd,
  onSetAction,
  onClearRecent,
}: StickerSetSectionProps) {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(documents !== undefined);
  const fixed = documents !== undefined;

  // Lazy mount: only fetch the set once its section is near the viewport.
  useEffect(() => {
    if (fixed) {
      setVisible(true);
      return;
    }
    const node = sectionRef.current;
    if (!node) {
      return;
    }
    const scroller = node.closest<HTMLElement>(".g-emoji-picker-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            return;
          }
        }
      },
      { root: scroller, rootMargin: "200px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fixed]);

  const enabled =
    !fixed && visible && canSend && Boolean(network) && Boolean(set?.ref);
  const resource = useStickerSet(network, set?.ref, enabled);
  const items = fixed ? (documents ?? []) : (resource.data?.stickers ?? []);
  const loading = !fixed && enabled && resource.loading && !resource.data;
  const loadFailed = !fixed && enabled && Boolean(resource.error) && !resource.data;
  // Before the section scrolls in (and while it loads) a skeleton pre-sized from
  // the known `set.count` reserves the final height, so sections further down
  // stay un-fetched and the scrollbar does not jump once they load.
  const showSkeleton = !fixed && !resource.data && (loading || !visible);
  const total = documents?.length ?? set?.count ?? items.length;
  const skeletonCount = Math.max(
    1,
    Math.min(total > 0 ? total : 10, SKELETON_CELL_CAP),
  );

  const [focusedIndex, setFocusedIndex] = useState(0);
  const activeIndex = items.length === 0 ? 0 : Math.min(focusedIndex, items.length - 1);
  const countLabel =
    total > 0 ? t("emojiPicker.stickerCount", { count: total }) : "";

  const focusFirstCell = () => {
    const section = sectionRef.current;
    const first = section?.querySelector<HTMLElement>("[data-picker-cell]");
    first?.focus();
    first?.scrollIntoView({ block: "nearest" });
  };

  const header = (
    <div
      className="g-emoji-picker-sticker-section-title"
      role="heading"
      aria-level={3}
      tabIndex={-1}
      data-section-header="true"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === "ArrowDown" || event.key === "Enter") {
          event.preventDefault();
          focusFirstCell();
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          onFocusRail();
        }
      }}
    >
      <span className="g-emoji-picker-sticker-section-title-text">
        {title}
        {countLabel ? (
          <span className="g-emoji-picker-visually-hidden"> {countLabel}</span>
        ) : null}
      </span>
      {onClearRecent ? (
        <button
          type="button"
          className="g-emoji-picker-section-action"
          aria-label={t("emojiPicker.clearRecent")}
          title={t("emojiPicker.clearRecent")}
          onClick={onClearRecent}
        >
          {t("common.clear")}
        </button>
      ) : null}
      {set && onSetAction ? (
        <StickerSetMoreMenu
          set={set}
          installed
          busy={busy}
          onAction={onSetAction}
        />
      ) : null}
    </div>
  );

  return (
    <section
      ref={sectionRef}
      className="g-emoji-picker-sticker-section"
      data-section-id={sectionId}
    >
      {set && onSetAction ? (
        <StickerSetContextMenu
          set={set}
          installed
          busy={busy}
          onAction={onSetAction}
        >
          {header}
        </StickerSetContextMenu>
      ) : onSetAction || onClearRecent ? (
        <StickerSetContextMenu onClearRecent={onClearRecent}>
          {header}
        </StickerSetContextMenu>
      ) : (
        header
      )}
      {showSkeleton ? (
        <StickerGridSkeleton count={skeletonCount} />
      ) : loadFailed ? (
        <PickerState
          text={t("emojiPicker.stickersUnavailable")}
          action={{ label: t("common.retry"), onClick: resource.reload }}
        />
      ) : items.length > 0 ? (
        <div
          className="g-emoji-picker-sticker-grid"
          data-picker-grid="true"
          role="group"
          aria-label={title}
          onKeyDown={(event) => handlePickerGridKeyDown(event, onFocusRail)}
        >
          {items.map((doc, index) => (
            <StickerCell
              key={docKey(doc) || index}
              doc={doc}
              index={index}
              tabbable={index === activeIndex}
              pending={pendingIds.has(docKey(doc))}
              faved={favedIds?.has(docKey(doc)) ?? false}
              onSend={onSend}
              onToggleFaved={onToggleFaved}
              onFocusCell={setFocusedIndex}
              onPreviewStart={onPreviewStart}
              onPreviewEnd={onPreviewEnd}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
