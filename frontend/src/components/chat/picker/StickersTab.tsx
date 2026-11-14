/**
 * Stickers tab: 49 px set rail + one vertical stack of sections.
 *
 * Layout matches Telegram Web K (temp/research2/stickers-gifs.md §2.2/§2.6):
 *   - rail: 38 px cover tabs at a 48 px pitch, active = 6% primary-text plate;
 *   - content: centred 16 px/19 px section titles, 5 columns of 72 px cells with
 *     4 px gaps (possible only because the scroll container uses 3 px side
 *     padding - the emoji tab keeps its 8 px);
 *   - sections are lazy (IntersectionObserver against this scroll container),
 *     skeletons are pre-sized from `set.count`;
 *   - cells are still thumbnails; a single floating overlay animates TGS/WebM on
 *     hover/hold;
 *   - click sends and the panel stays open (Web K), with a per-cell pending
 *     state and a local Recent promotion; failed sends refetch fresh doc refs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  noteStickerSent,
  refreshStickerDataAfterSendFailure,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { StickerDoc } from "../../../types";
import { PickerPreviewOverlay } from "./PickerPreviewOverlay";
import {
  PickerLoadingAnnouncement,
  PickerState,
  SetRailSkeleton,
  StickerGridSkeleton,
} from "./PickerStates";
import { PickerScrollbar } from "./PickerScrollbar";
import { StickerSetRail } from "./StickerSetRail";
import { StickerSetSection } from "./StickerSetSection";
import { usePickerPreview } from "./usePickerPreview";
import { useStickerPacks } from "./useStickerPacks";
import "./stickers.css";

const RECENT_ID = "recent";
const SCROLL_SETTLE_MS = 1200;

export interface StickersTabProps {
  network?: PickerNetwork;
  canSend: boolean;
  onSend?: (ref: string) => void | Promise<unknown>;
  onToast?: (message: string) => void;
  /** Focus the first control when the tab body mounts (tab switch / initialTab). */
  autoFocus?: boolean;
}

function documentKey(doc: StickerDoc): string {
  return doc.id || doc.ref;
}

export function StickersTab({
  network,
  canSend,
  onSend,
  onToast,
  autoFocus = false,
}: StickersTabProps) {
  const { t } = useTranslation();
  const resource = useStickerPacks(network, canSend && Boolean(network));
  const packs = resource.data;
  const { preview, show, hide } = usePickerPreview();

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [activeId, setActiveId] = useState<string>(RECENT_ID);
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingSectionRef = useRef<string | null>(null);
  const jumpLockRef = useRef(0);

  const recent = useMemo(() => packs?.recent ?? [], [packs]);
  const sets = useMemo(() => packs?.sets ?? [], [packs]);
  const sectionIds = useMemo(
    () => [
      ...(recent.length > 0 ? [RECENT_ID] : []),
      ...sets.map((set) => set.ref),
    ],
    [recent, sets],
  );
  const hasPacks = packs !== undefined;
  const isEmpty = hasPacks && sectionIds.length === 0;

  // The rail highlights the first available section until the user scrolls.
  useEffect(() => {
    setActiveId((previous) =>
      sectionIds.includes(previous) ? previous : (sectionIds[0] ?? RECENT_ID),
    );
  }, [sectionIds]);

  // Keyboard / tab-switch focus for the newly mounted tab body.
  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const pane = paneRef.current;
    if (!pane) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const target =
        pane.querySelector<HTMLElement>("[data-rail-id]") ??
        pane.querySelector<HTMLElement>("[data-picker-cell]");
      (target ?? pane).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, hasPacks]);

  const focusRail = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) {
      return;
    }
    const target =
      pane.querySelector<HTMLElement>('[data-rail-id][aria-pressed="true"]') ??
      pane.querySelector<HTMLElement>("[data-rail-id]");
    target?.focus();
    target?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);

  const jumpToSection = useCallback((id: string) => {
    setActiveId(id);
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    const sections = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-section-id]"),
    );
    const target = sections.find((section) => section.dataset.sectionId === id);
    if (!target) {
      return;
    }
    pendingSectionRef.current = id;
    jumpLockRef.current = Date.now() + SCROLL_SETTLE_MS;
    const top =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  // Scroll spy: the rail follows the section under the top of the viewport.
  useEffect(() => {
    if (!packs) {
      return;
    }
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      hide();
      const pendingSection = pendingSectionRef.current;
      if (pendingSection) {
        if (Date.now() < jumpLockRef.current) {
          const sections = scroller.querySelectorAll<HTMLElement>(
            "[data-section-id]",
          );
          const target = Array.from(sections).find(
            (section) => section.dataset.sectionId === pendingSection,
          );
          const delta = target
            ? target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
            : 0;
          if (Math.abs(delta) > 2) {
            return;
          }
        }
        pendingSectionRef.current = null;
      }
      const sections = Array.from(
        scroller.querySelectorAll<HTMLElement>("[data-section-id]"),
      );
      if (sections.length === 0) {
        return;
      }
      const containerTop = scroller.getBoundingClientRect().top;
      let current = sections[0].dataset.sectionId ?? "";
      for (const section of sections) {
        if (section.getBoundingClientRect().top - containerTop <= 40) {
          current = section.dataset.sectionId ?? current;
        }
      }
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      if (atBottom) {
        current = sections[sections.length - 1].dataset.sectionId ?? current;
      }
      if (current) {
        setActiveId((previous) => (previous === current ? previous : current));
      }
    };
    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [hide, packs]);

  const sendSticker = useCallback(
    async (doc: StickerDoc) => {
      const key = documentKey(doc);
      if (!network || pendingIdsRef.current.has(key)) {
        return;
      }
      if (!onSend) {
        onToast?.(t("input.sendFailed"));
        return;
      }
      pendingIdsRef.current.add(key);
      setPendingIds(new Set(pendingIdsRef.current));
      try {
        await onSend(doc.ref);
        hide();
        noteStickerSent(network, doc);
      } catch {
        refreshStickerDataAfterSendFailure(network);
        onToast?.(t("input.sendFailed"));
      } finally {
        pendingIdsRef.current.delete(key);
        setPendingIds(new Set(pendingIdsRef.current));
      }
    },
    [hide, network, onSend, onToast, t],
  );

  const showPreview = useCallback(
    (doc: StickerDoc, anchor: HTMLElement) => {
      show(
        {
          key: documentKey(doc),
          kind: doc.kind,
          emoji: doc.emoji,
          imageUrl: doc.kind === "static" ? (doc.photoUrl ?? doc.thumbUrl) : undefined,
          streamUrl: doc.streamUrl,
          posterUrl: doc.thumbUrl,
        },
        anchor,
      );
    },
    [show],
  );

  const navigateIntoSection = useCallback((id: string) => {
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    const sections = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-section-id]"),
    );
    const section = sections.find((item) => item.dataset.sectionId === id);
    const target =
      section?.querySelector<HTMLElement>("[data-picker-cell]") ??
      section?.querySelector<HTMLElement>("[data-section-header]");
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  }, []);

  const handlePaneKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" || event.defaultPrevented) {
      return;
    }
    if (event.target === paneRef.current) {
      event.preventDefault();
      focusRail();
    }
  };

  let content: ReactNode;
  if (!canSend) {
    content = <PickerState text={t("emojiPicker.stickersBlocked")} />;
  } else if (!network) {
    content = <PickerState text={t("emojiPicker.stickersUnavailable")} />;
  } else if (resource.error && !packs) {
    content = (
      <PickerState
        text={t("emojiPicker.stickersUnavailable")}
        action={{ label: t("common.retry"), onClick: resource.reload }}
      />
    );
  } else if (isEmpty) {
    content = <PickerState text={t("emojiPicker.noStickers")} />;
  } else {
    content = (
      <>
        {packs ? (
          <StickerSetRail
            recentCount={recent.length}
            sets={sets}
            activeId={activeId}
            onSelect={jumpToSection}
            onNavigateInto={navigateIntoSection}
          />
        ) : (
          <SetRailSkeleton />
        )}
        <div className="g-emoji-picker-scrollwrap">
          <div
            ref={scrollRef}
            className="g-emoji-picker-scroll"
            data-tab="stickers"
          >
            {packs ? null : (
              <>
                <PickerLoadingAnnouncement
                  text={t("emojiPicker.loadingStickers")}
                />
                <StickerGridSkeleton count={15} />
              </>
            )}
            {packs ? (
              <>
                {recent.length > 0 ? (
                  <StickerSetSection
                    sectionId={RECENT_ID}
                    title={t("emojiPicker.recentStickers")}
                    documents={recent}
                    canSend={canSend}
                    pendingIds={pendingIds}
                    onSend={sendSticker}
                    onFocusRail={focusRail}
                    onPreviewStart={showPreview}
                    onPreviewEnd={hide}
                  />
                ) : null}
                {sets.map((set) => (
                  <StickerSetSection
                    key={set.ref}
                    sectionId={set.ref}
                    title={set.title}
                    set={set}
                    network={network}
                    canSend={canSend}
                    pendingIds={pendingIds}
                    onSend={sendSticker}
                    onFocusRail={focusRail}
                    onPreviewStart={showPreview}
                    onPreviewEnd={hide}
                  />
                ))}
              </>
            ) : null}
          </div>
          <PickerScrollbar scrollerRef={scrollRef} />
        </div>
      </>
    );
  }

  return (
    <div
      ref={paneRef}
      className="g-emoji-picker-pane"
      tabIndex={-1}
      data-picker-pane="stickers"
      onKeyDown={handlePaneKeyDown}
    >
      {content}
      <PickerPreviewOverlay preview={preview} />
    </div>
  );
}
