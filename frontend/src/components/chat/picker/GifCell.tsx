/**
 * One saved-GIF grid cell. Like the sticker cells it shows only a still poster;
 * hovering/focusing the cell swaps the single animated preview overlay in.
 */
import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Clapperboard } from "lucide-react";
import type { SavedGif } from "../../../types";

interface GifCellProps {
  gif: SavedGif;
  index: number;
  tabbable: boolean;
  pending: boolean;
  onSend: (gif: SavedGif) => void;
  onFocusCell: (index: number) => void;
  onPreviewStart: (gif: SavedGif, anchor: HTMLElement) => void;
  onPreviewEnd: () => void;
}

export function GifCell({
  gif,
  index,
  tabbable,
  pending,
  onSend,
  onFocusCell,
  onPreviewStart,
  onPreviewEnd,
}: GifCellProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [gif.thumbUrl]);

  const label = t("emojiPicker.gifNumber", { index: index + 1 });

  return (
    <button
      type="button"
      className="g-emoji-picker-gif-cell"
      data-picker-cell="true"
      data-gif-id={gif.id}
      data-pending={pending || undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      onClick={() => onSend(gif)}
      onFocus={() => onFocusCell(index)}
      onPointerEnter={(event: ReactPointerEvent<HTMLButtonElement>) => {
        onPreviewStart(gif, event.currentTarget);
      }}
      onPointerLeave={onPreviewEnd}
      onPointerCancel={onPreviewEnd}
    >
      {gif.thumbUrl && !failed ? (
        <img
          className="g-emoji-picker-gif-image"
          src={gif.thumbUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="g-emoji-picker-gif-fallback" aria-hidden="true">
          <Clapperboard size={26} strokeWidth={1.5} />
        </span>
      )}
    </button>
  );
}
