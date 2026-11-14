/**
 * Shared loading/empty/error visuals for the sticker and GIF tabs.
 *
 * Geometry relies on the existing `.g-emoji-picker-empty` panel-style state and
 * the 72 px / 124 px grid metrics from `stickers.css`, so the skeleton occupies
 * exactly the space the real grid will, which is what keeps the custom scrollbar
 * from jumping while a section loads.
 */
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface PickerStateProps {
  text: string;
  icon?: ReactNode;
  loading?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function PickerState({ text, icon, loading, action }: PickerStateProps) {
  return (
    <div className="g-emoji-picker-empty" role="status">
      {icon}
      {loading ? (
        <Loader2 className="g-emoji-picker-spinner" size={20} aria-hidden="true" />
      ) : null}
      <span>{text}</span>
      {action ? (
        <button
          type="button"
          className="g-emoji-picker-state-action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** Screen-reader-only live status (the skeleton is visual only). */
export function PickerLoadingAnnouncement({ text }: { text: string }) {
  return (
    <span className="g-emoji-picker-visually-hidden" role="status">
      {text}
    </span>
  );
}

export function StickerGridSkeleton({ count }: { count: number }) {
  return (
    <div className="g-emoji-picker-sticker-grid" aria-hidden="true">
      {Array.from({ length: Math.max(1, count) }, (_, index) => (
        <div key={index} className="g-emoji-picker-sticker-skeleton" />
      ))}
    </div>
  );
}

export function GifGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="g-emoji-picker-gif-grid" aria-hidden="true">
      {Array.from({ length: Math.max(1, count) }, (_, index) => (
        <div key={index} className="g-emoji-picker-gif-skeleton" />
      ))}
    </div>
  );
}

export function SetRailSkeleton() {
  return (
    <div
      className="g-emoji-picker-set-rail g-emoji-picker-set-rail-skeleton"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="g-emoji-picker-set-tab-skeleton" />
      ))}
    </div>
  );
}
