/**
 * One sticker grid cell: still thumbnail only, never an animation (the animated
 * preview is the single floating overlay), click-to-send with a per-cell pending
 * state so a double click cannot send twice while the first RPC is in flight.
 */
import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Sticker } from "lucide-react";
import type { StickerDoc } from "../../../types";

interface StickerCellProps {
  doc: StickerDoc;
  index: number;
  tabbable: boolean;
  pending: boolean;
  onSend: (doc: StickerDoc) => void;
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
  onSend,
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

  return (
    <button
      type="button"
      className="g-emoji-picker-sticker-cell"
      data-picker-cell="true"
      data-sticker-id={doc.id}
      data-pending={pending || undefined}
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
    </button>
  );
}
