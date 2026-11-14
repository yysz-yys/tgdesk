/**
 * Stickers tab: 49 px set rail + search row + one vertical stack of sections.
 *
 * Layout matches Telegram Web K (temp/research2/stickers-gifs.md §2.2/§2.6):
 *   - rail: 38 px cover tabs at a 48 px pitch, active = 6% primary-text plate;
 *     Recent / Favorites icon tabs first, installed sets next, Trending last;
 *   - search row: 38 px rounded plate below the rail (Web K hides the rail while
 *     searching; this tab does the same so results get the full height);
 *   - content: centred 16 px/19 px section titles, 5 columns of 72 px cells with
 *     4 px gaps (possible only because the scroll container uses 3 px side
 *     padding - the emoji tab keeps its 8 px);
 *   - sections are lazy (IntersectionObserver against this scroll container),
 *     skeletons are pre-sized from `set.count`;
 *   - cells are still thumbnails; a single floating overlay animates TGS/WebM on
 *     hover/hold;
 *   - click sends and the panel stays open (Web K), with a per-cell pending
 *     state and a local Recent promotion; failed sends refetch fresh doc refs.
 *
 * Round-3 additions (the user asked for "sticker search / favorites /
 * install"): 300 ms-debounced server search rendered as a flat grid plus the
 * matching non-installed packs with an inline Add button; a Favorites section
 * fed by `messages.getFavedStickers` with a right-click heart toggle per cell; a
 * Trending section fed by `messages.getFeaturedStickers`; context menus on rail
 * tabs and section headers for Add / Archive / Remove set; and a Clear action on
 * the Recent section (`messages.clearRecentStickers`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import {
  archiveSet,
  clearPickerRecents,
  installSet,
  noteStickerSent,
  refreshStickerDataAfterSendFailure,
  toggleStickerFaved,
  uninstallSet,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { StickerDoc, StickerSetInfo } from "../../../types";
import { PickerPreviewOverlay } from "./PickerPreviewOverlay";
import {
  PickerLoadingAnnouncement,
  PickerState,
  SetRailSkeleton,
  StickerGridSkeleton,
} from "./PickerStates";
import { PickerScrollbar } from "./PickerScrollbar";
import type { StickerSetActionRequest } from "./StickerSetActions";
import { StickerSearchResults } from "./StickerSearchResults";
import { StickerSetRail } from "./StickerSetRail";
import { StickerSetRowList } from "./StickerSetRowList";
import { StickerSetSection } from "./StickerSetSection";
import { useFavedStickers } from "./useFavedStickers";
import { useFeaturedStickerSets } from "./useFeaturedStickerSets";
import { usePickerPreview } from "./usePickerPreview";
import { useStickerPacks } from "./useStickerPacks";
import { useStickerSearch } from "./useStickerSearch";
import "./stickers.css";

const RECENT_ID = "recent";
const FAVED_ID = "faved";
const TRENDING_ID = "trending";
const SCROLL_SETTLE_MS = 1200;
const FEATURED_LIMIT = 24;

export interface StickersTabProps {
  network?: PickerNetwork;
  canSend: boolean;
  onSend?: (ref: string) => void | Promise<unknown>;
  onToast?: (message: string) => void;
  /** Focus the search field when the tab body mounts (tab switch / initialTab). */
  autoFocus?: boolean;
}

function docKey(doc: StickerDoc): string {
  return doc.id || doc.ref;
}

function setKey(set: StickerSetInfo): string {
  return set.id || set.ref;
}

export function StickersTab({
  network,
  canSend,
  onSend,
  onToast,
  autoFocus = false,
}: StickersTabProps) {
  const { t } = useTranslation();
  const enabled = canSend && Boolean(network);
  const [query, setQuery] = useState("");
  const searchText = query.trim();
  const searching = searchText.length > 0;

  const packsResource = useStickerPacks(network, enabled);
  const favedResource = useFavedStickers(network, enabled);
  // Trending is a showcase read: only fetch it while the tab is not searching.
  const featuredResource = useFeaturedStickerSets(network, enabled && !searching);
  const search = useStickerSearch(network, query, enabled);
  const { preview, show, hide } = usePickerPreview();

  const packs = packsResource.data;
  const recent = useMemo(() => packs?.recent ?? [], [packs]);
  const sets = useMemo(() => packs?.sets ?? [], [packs]);
  const faved = useMemo(() => favedResource.data ?? [], [favedResource.data]);

  const favedIds = useMemo(() => new Set(faved.map(docKey)), [faved]);
  const installedIds = useMemo(() => new Set(sets.map(setKey)), [sets]);
  const featured = useMemo(() => {
    const list = featuredResource.data ?? [];
    return list
      .filter(
        (set) =>
          Boolean(set.ref) &&
          set.installed !== true &&
          !installedIds.has(setKey(set)) &&
          !set.archived,
      )
      .slice(0, FEATURED_LIMIT);
  }, [featuredResource.data, installedIds]);

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [busyRefs, setBusyRefs] = useState<ReadonlySet<string>>(new Set());
  const busyRefsRef = useRef<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string>(RECENT_ID);

  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pendingSectionRef = useRef<string | null>(null);
  const jumpLockRef = useRef(0);

  const sectionIds = useMemo(() => {
    const list: string[] = [];
    if (recent.length > 0) {
      list.push(RECENT_ID);
    }
    if (faved.length > 0) {
      list.push(FAVED_ID);
    }
    for (const set of sets) {
      list.push(set.ref);
    }
    if (featured.length > 0) {
      list.push(TRENDING_ID);
    }
    return list;
  }, [faved.length, featured.length, recent.length, sets]);

  const hasFeatured = featured.length > 0;
  const featuredPending =
    !searching &&
    !hasFeatured &&
    featuredResource.data === undefined &&
    featuredResource.error === null;
  const hasPacks = packs !== undefined;
  const isEmpty = hasPacks && !featuredPending && sectionIds.length === 0;

  // The rail highlights the first available section until the user scrolls.
  useEffect(() => {
    setActiveId((previous) =>
      sectionIds.includes(previous) ? previous : (sectionIds[0] ?? RECENT_ID),
    );
  }, [sectionIds]);

  // Focus the search field when the tab body mounts (Web K's search-first flow);
  // fall back to the rail when the field is not rendered.
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
        pane.querySelector<HTMLElement>("[data-picker-search]") ??
        pane.querySelector<HTMLElement>("[data-rail-id]") ??
        pane.querySelector<HTMLElement>("[data-picker-cell]");
      (target ?? pane).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  // A new query starts the result list at the top (Web K resets the scroll).
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }, [search.query, searching]);

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
  }, [hide, packs, searching]);

  const sendSticker = useCallback(
    async (doc: StickerDoc) => {
      const key = docKey(doc);
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

  const toggleFaved = useCallback(
    async (doc: StickerDoc) => {
      if (!network) {
        return;
      }
      const nextFaved = !favedIds.has(docKey(doc));
      try {
        // Paints the Favorites section optimistically and rolls back on failure.
        await toggleStickerFaved(network, doc, nextFaved);
      } catch {
        onToast?.(t("emojiPicker.actionFailed"));
      }
    },
    [favedIds, network, onToast, t],
  );

  const clearRecent = useCallback(async () => {
    if (!network) {
      return;
    }
    try {
      await clearPickerRecents(network);
      onToast?.(t("emojiPicker.recentCleared"));
    } catch {
      onToast?.(t("emojiPicker.actionFailed"));
    }
  }, [network, onToast, t]);

  const handleSetAction = useCallback(
    async (request: StickerSetActionRequest) => {
      if (!network || busyRefsRef.current.has(request.set.ref)) {
        return;
      }
      const { kind, set } = request;
      busyRefsRef.current.add(set.ref);
      setBusyRefs(new Set(busyRefsRef.current));
      try {
        if (kind === "install") {
          await installSet(network, set.ref);
          onToast?.(t("emojiPicker.setAdded"));
        } else if (kind === "uninstall") {
          await uninstallSet(network, set.ref);
          onToast?.(t("emojiPicker.setRemoved"));
        } else {
          await archiveSet(network, set.ref, true);
          onToast?.(t("emojiPicker.setArchived"));
        }
      } catch {
        onToast?.(t("emojiPicker.actionFailed"));
      } finally {
        busyRefsRef.current.delete(set.ref);
        setBusyRefs(new Set(busyRefsRef.current));
      }
    },
    [network, onToast, t],
  );

  const showPreview = useCallback(
    (doc: StickerDoc, anchor: HTMLElement) => {
      show(
        {
          key: docKey(doc),
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

  const focusFirstResult = useCallback(() => {
    const scroller = scrollRef.current;
    const first = scroller?.querySelector<HTMLElement>("[data-picker-cell]");
    first?.focus();
    first?.scrollIntoView({ block: "nearest" });
  }, []);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (searching) {
        focusFirstResult();
      } else {
        focusRail();
      }
    }
  };

  const handlePaneKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" || event.defaultPrevented) {
      return;
    }
    if (event.target === paneRef.current) {
      event.preventDefault();
      focusRail();
    }
  };

  const searchRow = enabled ? (
    <div className="g-emoji-picker-search g-emoji-picker-tab-search" role="search">
      <Search
        className="g-emoji-picker-search-icon"
        size={17}
        strokeWidth={1.9}
        aria-hidden="true"
      />
      <input
        ref={searchRef}
        className="g-emoji-picker-search-input"
        type="text"
        value={query}
        placeholder={t("emojiPicker.searchStickers")}
        aria-label={t("emojiPicker.searchStickers")}
        data-picker-search="true"
        data-testid="sticker-picker-search"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleSearchKeyDown}
      />
      {query ? (
        <button
          type="button"
          className="g-emoji-picker-search-clear"
          aria-label={t("emojiPicker.clearSearch")}
          title={t("emojiPicker.clearSearch")}
          onClick={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  ) : null;

  const installedRowIds = installedIds;

  let body: ReactNode;
  if (!canSend) {
    body = <PickerState text={t("emojiPicker.stickersBlocked")} />;
  } else if (!network) {
    body = <PickerState text={t("emojiPicker.stickersUnavailable")} />;
  } else if (searching) {
    body = (
      <>
        {searchRow}
        <div className="g-emoji-picker-scrollwrap">
          <div
            ref={scrollRef}
            className="g-emoji-picker-scroll"
            data-tab="stickers"
            data-searching="true"
          >
            <StickerSearchResults
              query={searchText}
              data={search.data}
              loading={search.loading}
              error={search.error}
              favedIds={favedIds}
              pendingIds={pendingIds}
              installedIds={installedRowIds}
              busySetRefs={busyRefs}
              onRetry={search.reload}
              onSend={sendSticker}
              onToggleFaved={toggleFaved}
              onInstallSet={(set) => {
                void handleSetAction({ kind: "install", set });
              }}
              onPreviewStart={showPreview}
              onPreviewEnd={hide}
              onEscapeToSearch={() => searchRef.current?.focus()}
            />
          </div>
          <PickerScrollbar scrollerRef={scrollRef} />
        </div>
      </>
    );
  } else if (!hasPacks && packsResource.error) {
    body = (
      <>
        {searchRow}
        <PickerState
          text={t("emojiPicker.stickersUnavailable")}
          action={{ label: t("common.retry"), onClick: packsResource.reload }}
        />
      </>
    );
  } else if (isEmpty) {
    body = (
      <>
        {searchRow}
        <PickerState text={t("emojiPicker.noStickers")} />
      </>
    );
  } else {
    body = (
      <>
        {packs ? (
          <StickerSetRail
            recentCount={recent.length}
            favedCount={faved.length}
            featuredCount={featured.length}
            sets={sets}
            activeId={activeId}
            busyRefs={busyRefs}
            onSelect={jumpToSection}
            onNavigateInto={navigateIntoSection}
            onSetAction={(request) => {
              void handleSetAction(request);
            }}
            onClearRecent={() => {
              void clearRecent();
            }}
          />
        ) : (
          <SetRailSkeleton />
        )}
        {searchRow}
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
                    favedIds={favedIds}
                    onSend={sendSticker}
                    onToggleFaved={toggleFaved}
                    onFocusRail={focusRail}
                    onPreviewStart={showPreview}
                    onPreviewEnd={hide}
                    onClearRecent={() => {
                      void clearRecent();
                    }}
                  />
                ) : null}
                {faved.length > 0 ? (
                  <StickerSetSection
                    sectionId={FAVED_ID}
                    title={t("emojiPicker.favoriteStickers")}
                    documents={faved}
                    canSend={canSend}
                    pendingIds={pendingIds}
                    favedIds={favedIds}
                    onSend={sendSticker}
                    onToggleFaved={toggleFaved}
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
                    favedIds={favedIds}
                    busy={busyRefs.has(set.ref)}
                    onSend={sendSticker}
                    onToggleFaved={toggleFaved}
                    onFocusRail={focusRail}
                    onPreviewStart={showPreview}
                    onPreviewEnd={hide}
                    onSetAction={(request) => {
                      void handleSetAction(request);
                    }}
                  />
                ))}
                {featured.length > 0 ? (
                  <StickerSetRowList
                    title={t("emojiPicker.trendingStickers")}
                    sets={featured}
                    installedIds={installedRowIds}
                    busyRefs={busyRefs}
                    onInstall={(set) => {
                      void handleSetAction({ kind: "install", set });
                    }}
                    sectionId={TRENDING_ID}
                  />
                ) : null}
                {featuredPending && sectionIds.length === 0 ? (
                  <>
                    <PickerLoadingAnnouncement
                      text={t("emojiPicker.loadingStickers")}
                    />
                    <StickerGridSkeleton count={5} />
                  </>
                ) : null}
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
      {body}
      <PickerPreviewOverlay preview={preview} />
    </div>
  );
}
