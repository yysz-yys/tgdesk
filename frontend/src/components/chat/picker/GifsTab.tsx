/**
 * GIF tab: Telegram Web K's `.gifs-masonry` geometry - 3 equal columns of
 * 124 px cells, 2 px gaps, 3 px side margins, 4 px top / 3 px bottom - filled
 * with still poster thumbnails; the single floating preview overlay plays the
 * MP4 (or legacy GIF) on hover/hold. Click sends and keeps the panel open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  noteGifSent,
  refreshStickerDataAfterSendFailure,
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
import { usePickerPreview } from "./usePickerPreview";
import { useSavedGifs } from "./useSavedGifs";
import "./stickers.css";

export interface GifsTabProps {
  network?: PickerNetwork;
  canSend: boolean;
  onSend?: (ref: string) => void | Promise<unknown>;
  onToast?: (message: string) => void;
  /** Focus the first GIF cell when the tab body mounts. */
  autoFocus?: boolean;
}

function gifKey(gif: SavedGif): string {
  return gif.id || gif.ref;
}

export function GifsTab({
  network,
  canSend,
  onSend,
  onToast,
  autoFocus = false,
}: GifsTabProps) {
  const { t } = useTranslation();
  const resource = useSavedGifs(network, canSend && Boolean(network));
  const gifs = resource.data;
  const { preview, show, hide } = usePickerPreview();

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasGifs = gifs !== undefined;
  const isEmpty = hasGifs && gifs.length === 0;

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const pane = paneRef.current;
    if (!pane) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const target = pane.querySelector<HTMLElement>("[data-picker-cell]");
      (target ?? pane).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, hasGifs]);

  const sendGif = useCallback(
    async (gif: SavedGif) => {
      const key = gifKey(gif);
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
        await onSend(gif.ref);
        hide();
        noteGifSent(network, gif);
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

  // Hide the floating preview whenever the grid scrolls away from its anchor.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    const onScroll = () => hide();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [hide]);

  const activeIndex =
    gifs && gifs.length > 0
      ? Math.min(focusedIndex, gifs.length - 1)
      : 0;

  let content: ReactNode;
  if (!canSend) {
    content = <PickerState text={t("emojiPicker.gifsBlocked")} />;
  } else if (!network) {
    content = <PickerState text={t("emojiPicker.gifsUnavailable")} />;
  } else if (resource.error && !gifs) {
    content = (
      <PickerState
        text={t("emojiPicker.gifsUnavailable")}
        action={{ label: t("common.retry"), onClick: resource.reload }}
      />
    );
  } else if (isEmpty) {
    content = <PickerState text={t("emojiPicker.noGifs")} />;
  } else {
    content = (
      <div className="g-emoji-picker-scrollwrap">
        <div ref={scrollRef} className="g-emoji-picker-scroll" data-tab="gifs">
          {gifs ? (
            <div
              className="g-emoji-picker-gif-grid"
              role="group"
              aria-label={t("emojiPicker.gifs")}
              onKeyDown={(event) => handlePickerGridKeyDown(event)}
            >
              {gifs.map((gif, index) => (
                <GifCell
                  key={gifKey(gif) || index}
                  gif={gif}
                  index={index}
                  tabbable={index === activeIndex}
                  pending={pendingIds.has(gifKey(gif))}
                  onSend={sendGif}
                  onFocusCell={setFocusedIndex}
                  onPreviewStart={showPreview}
                  onPreviewEnd={hide}
                />
              ))}
            </div>
          ) : (
            <>
              <PickerLoadingAnnouncement text={t("emojiPicker.loadingGifs")} />
              <GifGridSkeleton count={9} />
            </>
          )}
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
      {content}
      <PickerPreviewOverlay preview={preview} />
    </div>
  );
}
