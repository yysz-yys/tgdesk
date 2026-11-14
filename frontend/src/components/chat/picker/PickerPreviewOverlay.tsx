/**
 * Floating enlarged preview (the only animated sticker/GIF in the picker).
 *
 * Rendered through a portal on `document.body` so the 382×420 panel's
 * `overflow: hidden` cannot clip it. `pointer-events: none` keeps the cell's
 * hover/click handling intact. Anchored above the cell and clamped into the
 * viewport; flips below when there is no room above.
 */
import { createPortal } from "react-dom";
import { PickerTgsPlayer } from "./PickerTgsPlayer";

export type PreviewKind = "static" | "tgs" | "webm" | "gif";

export interface PreviewDescriptor {
  /** Stable identity so React remounts the animation when the cell changes. */
  key: string;
  kind: PreviewKind;
  emoji?: string;
  /** Still image for static stickers (full document or thumb). */
  imageUrl?: string;
  /** Animated source: TGS, WebM sticker or MP4 GIF. */
  streamUrl?: string;
  posterUrl?: string;
}

export interface PreviewOverlayProps {
  preview: { descriptor: PreviewDescriptor; anchor: DOMRect } | null;
}

const OVERLAY_WIDTH = 224;
const OVERLAY_HEIGHT = 250;
const VIEWPORT_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function PreviewMedia({ descriptor }: { descriptor: PreviewDescriptor }) {
  if (descriptor.kind === "tgs" && descriptor.streamUrl) {
    return (
      <PickerTgsPlayer
        key={`${descriptor.key}:tgs`}
        src={descriptor.streamUrl}
        posterUrl={descriptor.posterUrl}
        className="g-emoji-picker-preview-tgs"
      />
    );
  }
  if (
    (descriptor.kind === "webm" || descriptor.kind === "gif") &&
    descriptor.streamUrl
  ) {
    return (
      <video
        key={`${descriptor.key}:video`}
        className="g-emoji-picker-preview-video"
        src={descriptor.streamUrl}
        poster={descriptor.posterUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }
  if (descriptor.imageUrl) {
    return (
      <img
        className="g-emoji-picker-preview-image"
        src={descriptor.imageUrl}
        alt=""
        draggable={false}
        decoding="async"
      />
    );
  }
  if (descriptor.posterUrl) {
    return (
      <img
        className="g-emoji-picker-preview-image"
        src={descriptor.posterUrl}
        alt=""
        draggable={false}
        decoding="async"
      />
    );
  }
  return null;
}

export function PickerPreviewOverlay({ preview }: PreviewOverlayProps) {
  if (!preview) {
    return null;
  }
  const { descriptor, anchor } = preview;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    viewportWidth - OVERLAY_WIDTH - VIEWPORT_MARGIN,
  );
  const left = clamp(
    anchor.left + anchor.width / 2 - OVERLAY_WIDTH / 2,
    VIEWPORT_MARGIN,
    maxLeft,
  );
  const above = anchor.top - OVERLAY_HEIGHT - VIEWPORT_MARGIN;
  const below = anchor.bottom + VIEWPORT_MARGIN;
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    viewportHeight - OVERLAY_HEIGHT - VIEWPORT_MARGIN,
  );
  const top =
    above >= VIEWPORT_MARGIN
      ? above
      : clamp(below, VIEWPORT_MARGIN, maxTop);

  return createPortal(
    <div
      className="g-emoji-picker-preview"
      data-kind={descriptor.kind}
      role="presentation"
      aria-hidden="true"
      style={{ left, top }}
    >
      {descriptor.emoji ? (
        <div className="g-emoji-picker-preview-emoji">{descriptor.emoji}</div>
      ) : null}
      <div className="g-emoji-picker-preview-media">
        <PreviewMedia descriptor={descriptor} />
      </div>
    </div>,
    document.body,
  );
}
