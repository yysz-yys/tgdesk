/**
 * One sticker grid cell: still thumbnail only, never an animation (the animated
 * preview is the single floating overlay), click-to-send with a per-cell pending
 * state so a double click cannot send twice while the first RPC is in flight.
 *
 * Right-click (or the context-menu key) opens the Web K sticker menu: Send and
 * Add/Remove from Favorites, which is how Telegram toggles `messages.faveSticker`
 * from the picker. Favorited cells carry a small heart badge.
 */
import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Heart, HeartOff, Send, Sticker } from "lucide-react";
import type { StickerDoc } from "../../../types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../../ui";

interface StickerCellProps {
  doc: StickerDoc;
  index: number;
  tabbable: boolean;
  pending: boolean;
  /** True when the sticker is in the account's favorites list. */
  faved?: boolean;
  onSend: (doc: StickerDoc) => void;
  onToggleFaved?: (doc: StickerDoc) => void;
  onFocusCell: (index: number) => void;
  onPreviewStart: (doc: StickerDoc, anchor: HTMLElement) => void;
  onPreviewEnd: () => void;
}

function thumbSource(doc: StickerDoc): string | undefined {
  if (doc.thumbUrl) {
    return doc.thumbUrl;
  }
  // Static stickers are small WebP documents; when the kernel registered no
  // separate thumb the full document is the correct still image. Never feed
  // .tgs / .webm bytes to <img>.
  return doc.kind === "static" ? doc.photoUrl : undefined;
}

export function StickerCell({
  doc,
  index,
  tabbable,
  pending,
  faved = false,
  onSend,
  onToggleFaved,
  onFocusCell,
  onPreviewStart,
  onPreviewEnd,
}: StickerCellProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const source = thumbSource(doc);

  useEffect(() => {
    setFailed(false);
  }, [source]);

  const label = doc.emoji || t("emojiPicker.stickerNumber", { index: index + 1 });

  const button = (
    <button
      type="button"
      className="g-emoji-picker-sticker-cell"
      data-picker-cell="true"
      data-sticker-id={doc.id}
      data-pending={pending || undefined}
      data-faved={faved || undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      onClick={() => onSend(doc)}
      onFocus={() => onFocusCell(index)}
      onPointerEnter={(event: ReactPointerEvent<HTMLButtonElement>) => {
        onPreviewStart(doc, event.currentTarget);
      }}
      onPointerLeave={onPreviewEnd}
      onPointerCancel={onPreviewEnd}
    >
      {source && !failed ? (
        <img
          className="g-emoji-picker-sticker-image"
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="g-emoji-picker-sticker-fallback" aria-hidden="true">
          {doc.emoji || <Sticker size={30} strokeWidth={1.5} />}
        </span>
      )}
      {faved ? (
        <span className="g-emoji-picker-sticker-fav" aria-hidden="true">
          <Heart size={11} strokeWidth={2.4} fill="currentColor" />
        </span>
      ) : null}
    </button>
  );

  if (!onToggleFaved) {
    return button;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          icon={<Send size={16} strokeWidth={1.8} aria-hidden="true" />}
          disabled={pending}
          onSelect={() => onSend(doc)}
        >
          {t("emojiPicker.send")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={
            faved ? (
              <HeartOff size={16} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Heart size={16} strokeWidth={1.8} aria-hidden="true" />
            )
          }
          disabled={pending}
          onSelect={() => onToggleFaved(doc)}
        >
          {faved
            ? t("emojiPicker.removeFromFavorites")
            : t("emojiPicker.addToFavorites")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
