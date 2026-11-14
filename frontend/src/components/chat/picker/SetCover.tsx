/**
 * Set cover used by the 49 px rail and by set rows (search / featured lists).
 *
 * Telegram Web K's set covers are animated TGS/WebM files; the picker (like its
 * sticker cells) only paints a still image, so animated covers fall back to the
 * rounded title initial. The 30 px rail size comes from the parent CSS; rows
 * override it with their own class.
 */
import { useEffect, useState } from "react";
import { Sticker } from "lucide-react";
import { cn } from "../../../lib/cn";
import type { StickerSetInfo } from "../../../types";

interface SetCoverProps {
  set: StickerSetInfo;
  className?: string;
}

export function SetCover({ set, className }: SetCoverProps) {
  const [failed, setFailed] = useState(false);
  const animatedCover = set.coverKind === "tgs" || set.coverKind === "webm";

  useEffect(() => {
    setFailed(false);
  }, [set.coverUrl]);

  if (set.coverUrl && !animatedCover && !failed) {
    return (
      <img
        className={cn("g-emoji-picker-set-cover", className)}
        src={set.coverUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  const initial = set.title.trim().slice(0, 1).toUpperCase();
  return (
    <span
      className={cn(
        "g-emoji-picker-set-cover",
        "g-emoji-picker-set-initial",
        className,
      )}
      aria-hidden="true"
    >
      {initial || <Sticker size={16} strokeWidth={1.7} />}
    </span>
  );
}
