/**
 * GIF tab: Telegram Web K's `.gifs-masonry` geometry - 3 equal columns of
 * 124 px cells, 2 px gaps, 3 px side margins, 4 px top / 3 px bottom - filled
 * with still poster thumbnails; the single floating preview overlay plays the
 * MP4 (or legacy GIF) on hover/hold. Click sends and keeps the panel open.
 *
 * Empty query: the account's saved GIFs (`messages.getSavedGifs`).
 * Non-empty query: the inline `@gif` bot search (`messages.getInlineBotResults`
 * through the kernel), debounced 400 ms like Web K, appended page by page from
 * the bot's `next_offset` while the grid scrolls. Search results are sent with
 * `messages.sendInlineBotResult` (SendInlineGif) and can be saved with
 * `messages.saveGif`; saved cells expose the same heart as an unsave action.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  UIEvent as ReactUIEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Search, X } from "lucide-react";
import {
  noteGifSent,
  refreshStickerDataAfterSendFailure,
  setSavedGif,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { SavedGif } from "../../../types";
import { GifCell } from "./GifCell";
import { PickerPreviewOverlay } from "./PickerPreviewOverlay";
import {
  GifGridSkeleton,
  PickerLoadingAnnouncement,
  PickerState,
} from "./PickerStates";
import { PickerScrollbar } from "./PickerScrollbar";
import { handlePickerGridKeyDown } from "./gridKeyboard";
import { useGifSearch } from "./useGifSearch";
import { usePickerPreview } from "./usePickerPreview";
import { useSavedGifs } from "./useSavedGifs";
import "./stickers.css";

export interface GifsTabProps {
  network?: PickerNetwork;
  canSend: boolean;
  /** Sends a saved GIF document by its opaque kernel ref. */
  onSend?: (ref: string) => void | Promise<unknown>;
  /**
   * Sends one inline GIF search result (`messages.sendInlineBotResult`). The
   * picker does not know the chat id, so the host wires this to ChatView/App
   * (see the EmojiPicker `onSendInlineGif` prop). Falling back to `onSend` is
   * not possible: search refs are inline handles, not document refs.
   */
  onSendInlineGif?: (
    queryId: number,
    resultId: string,
    replyToID?: number,
  ) => void | Promise<unknown>;
  onToast?: (message: string) => void;
  /** Focus the search field when the tab body mounts. */
  autoFocus?: boolean;
}

function gifKey(gif: SavedGif): string {
  return gif.id || gif.ref;
}

export function GifsTab({
  network,
  canSend,
  onSend,
  onSendInlineGif,
  onToast,
  autoFocus = false,
}: GifsTabProps) {
  const { t } = useTranslation();
  const enabled = canSend && Boolean(network);
  const [query, setQuery] = useState("");
  const searchText = query.trim();
  const searching = searchText.length > 0;

  const savedResource = useSavedGifs(network, enabled);
  const savedGifs = useMemo(() => savedResource.data ?? [], [savedResource.data]);
  const savedIds = useMemo(
    () => new Set(savedGifs.map(gifKey)),
    [savedGifs],
  );
  const search = useGifSearch(network, query, enabled);
  const { preview, show, hide } = usePickerPreview();

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());
  const savingIdsRef = useRef<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const gifs: SavedGif[] = searching ? search.gifs : savedGifs;
  const hasSaved = savedResource.data !== undefined;
  const hasResults = searching
    ? search.gifs.length > 0
    : savedGifs.length > 0;
  const searchEmpty =
    searching && !search.loading && !search.error && search.gifs.length === 0;
  const savedEmpty = !searching && hasSaved && savedGifs.length === 0;

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
        pane.querySelector<HTMLElement>("[data-picker-cell]");
      (target ?? pane).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  // A new search starts at the top of the grid.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }, [search.query, searching]);

  // Hide the floating preview whenever the grid scrolls and page in more search
  // results as the user approaches the bottom (Web K's masonry behaviour). A
  // React onScroll handler is used instead of an effect-attached listener
  // because the scroll container is remounted when the tab switches between the
  // skeleton and the grid branches.
  const handleScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      hide();
      if (!searching) {
        return;
      }
      const scroller = event.currentTarget;
      const remaining =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (remaining < 240) {
        search.loadMore();
      }
    },
    [hide, searching, search.loadMore],
  );

  const activatePending = useCallback((key: string, active: boolean) => {
    if (active) {
      pendingIdsRef.current.add(key);
    } else {
      pendingIdsRef.current.delete(key);
    }
    setPendingIds(new Set(pendingIdsRef.current));
  }, []);

  const activateSaving = useCallback((key: string, active: boolean) => {
    if (active) {
      savingIdsRef.current.add(key);
    } else {
      savingIdsRef.current.delete(key);
    }
    setSavingIds(new Set(savingIdsRef.current));
  }, []);

  const sendSavedGif = useCallback(
    async (gif: SavedGif) => {
      const key = gifKey(gif);
      if (!network || pendingIdsRef.current.has(key)) {
        return;
      }
      if (!onSend) {
        onToast?.(t("input.sendFailed"));
        return;
      }
      activatePending(key, true);
      try {
        await onSend(gif.ref);
        hide();
        noteGifSent(network, gif);
      } catch {
        refreshStickerDataAfterSendFailure(network);
        onToast?.(t("input.sendFailed"));
      } finally {
        activatePending(key, false);
      }
    },
    [activatePending, hide, network, onSend, onToast, t],
  );

  const sendSearchGif = useCallback(
    async (gif: SavedGif) => {
      const key = gifKey(gif);
      if (!network || pendingIdsRef.current.has(key)) {
        return;
      }
      if (!onSendInlineGif) {
        // Not wired by the host yet; the inline handle cannot go through SendGif.
        onToast?.(t("input.sendFailed"));
        return;
      }
      activatePending(key, true);
      try {
        const resultId = gif.resultId ?? gif.ref;
        await onSendInlineGif(search.queryId, resultId);
        hide();
      } catch {
        onToast?.(t("input.sendFailed"));
      } finally {
        activatePending(key, false);
      }
    },
    [activatePending, hide, network, onSendInlineGif, onToast, search.queryId, t],
  );

  const sendGif = useCallback(
    (gif: SavedGif) => {
      if (searching) {
        void sendSearchGif(gif);
      } else {
        void sendSavedGif(gif);
      }
    },
    [searching, sendSavedGif, sendSearchGif],
  );

  const toggleSaved = useCallback(
    async (gif: SavedGif, currentlySaved: boolean) => {
      const key = gifKey(gif);
      if (!network || savingIdsRef.current.has(key)) {
        return;
      }
      activateSaving(key, true);
      try {
        await setSavedGif(network, gif.ref, !currentlySaved);
        onToast?.(
          currentlySaved ? t("emojiPicker.gifRemoved") : t("emojiPicker.gifSaved"),
        );
      } catch {
        onToast?.(t("emojiPicker.actionFailed"));
      } finally {
        activateSaving(key, false);
      }
    },
    [activateSaving, network, onToast, t],
  );

  const showPreview = useCallback(
    (gif: SavedGif, anchor: HTMLElement) => {
      show(
        {
          key: gifKey(gif),
          kind: "gif",
          streamUrl: gif.streamUrl,
          posterUrl: gif.thumbUrl,
        },
        anchor,
      );
    },
    [show],
  );

  const focusFirstCell = useCallback(() => {
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
      focusFirstCell();
    }
  };

  const activeIndex = gifs.length > 0 ? Math.min(focusedIndex, gifs.length - 1) : 0;

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
        placeholder={t("emojiPicker.searchGifs")}
        aria-label={t("emojiPicker.searchGifs")}
        data-picker-search="true"
        data-testid="gif-picker-search"
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

  let content: ReactNode;
  if (!canSend) {
    content = <PickerState text={t("emojiPicker.gifsBlocked")} />;
  } else if (!network) {
    content = <PickerState text={t("emojiPicker.gifsUnavailable")} />;
  } else if (searching && !search.loading && search.error && search.gifs.length === 0) {
    content = (
      <PickerState
        text={t("emojiPicker.gifsUnavailable")}
        action={{ label: t("common.retry"), onClick: search.reload }}
      />
    );
  } else if (searchEmpty) {
    content = <PickerState text={t("emojiPicker.noGifsFound")} />;
  } else if (savedEmpty) {
    content = <PickerState text={t("emojiPicker.noGifs")} />;
  } else if (!searching && savedResource.error && !hasSaved) {
    content = (
      <PickerState
        text={t("emojiPicker.gifsUnavailable")}
        action={{ label: t("common.retry"), onClick: savedResource.reload }}
      />
    );
  } else if (!searching && !hasSaved) {
    content = (
      <div className="g-emoji-picker-scrollwrap">
        <div
          ref={scrollRef}
          className="g-emoji-picker-scroll"
          data-tab="gifs"
          onScroll={handleScroll}
        >
          <PickerLoadingAnnouncement text={t("emojiPicker.loadingGifs")} />
          <GifGridSkeleton count={9} />
        </div>
        <PickerScrollbar scrollerRef={scrollRef} />
      </div>
    );
  } else if (searching && search.loading && !hasResults) {
    content = (
      <div className="g-emoji-picker-scrollwrap">
        <div
          ref={scrollRef}
          className="g-emoji-picker-scroll"
          data-tab="gifs"
          onScroll={handleScroll}
        >
          <PickerLoadingAnnouncement text={t("emojiPicker.loadingGifs")} />
          <GifGridSkeleton count={9} />
        </div>
        <PickerScrollbar scrollerRef={scrollRef} />
      </div>
    );
  } else {
    content = (
      <div className="g-emoji-picker-scrollwrap">
        <div
          ref={scrollRef}
          className="g-emoji-picker-scroll"
          data-tab="gifs"
          data-searching={searching ? "true" : undefined}
          onScroll={handleScroll}
        >
          {searching ? (
            <div
              className="g-emoji-picker-gif-results-header"
              data-query={searchText}
              role="status"
            >
              {t("emojiPicker.searchResults")}
            </div>
          ) : null}
          <div
            className="g-emoji-picker-gif-grid"
            data-picker-grid="true"
            data-query={searching ? searchText : undefined}
            role="group"
            aria-label={searching ? t("emojiPicker.searchResults") : t("emojiPicker.gifs")}
            onKeyDown={(event) =>
              handlePickerGridKeyDown(event, () => {
                if (searching) {
                  searchRef.current?.focus();
                }
              })
            }
          >
            {gifs.map((gif, index) => {
              const saved = savedIds.has(gifKey(gif));
              return (
                <GifCell
                  key={gifKey(gif) || index}
                  gif={gif}
                  index={index}
                  tabbable={index === activeIndex}
                  pending={pendingIds.has(gifKey(gif))}
                  saved={saved}
                  saving={savingIds.has(gifKey(gif))}
                  onSend={sendGif}
                  onToggleSaved={(target) => {
                    void toggleSaved(target, saved);
                  }}
                  onFocusCell={setFocusedIndex}
                  onPreviewStart={showPreview}
                  onPreviewEnd={hide}
                />
              );
            })}
          </div>
          {searching && search.loadingMore ? (
            <div className="g-emoji-picker-gif-more" role="status">
              <Loader2
                className="g-emoji-picker-spinner"
                size={16}
                aria-hidden="true"
              />
              <span className="g-emoji-picker-visually-hidden">
                {t("emojiPicker.loadingGifs")}
              </span>
            </div>
          ) : null}
          {searching && search.error && search.gifs.length > 0 ? (
            <div className="g-emoji-picker-gif-more">
              <button
                type="button"
                className="g-emoji-picker-state-action"
                onClick={search.loadMore}
              >
                {t("common.retry")}
              </button>
            </div>
          ) : null}
        </div>
        <PickerScrollbar scrollerRef={scrollRef} />
      </div>
    );
  }

  return (
    <div
      ref={paneRef}
      className="g-emoji-picker-pane"
      tabIndex={-1}
      data-picker-pane="gifs"
    >
      {searchRow}
      {content}
      <PickerPreviewOverlay preview={preview} />
    </div>
  );
}
