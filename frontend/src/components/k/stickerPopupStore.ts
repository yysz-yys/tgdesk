import { useSyncExternalStore } from "react";
import type { StickerSetInfo } from "../../types";

/**
 * The sticker-set preview popup state (tweb `showStickersPopup`).
 *
 * It lives outside React (like `tipsStore`) because the popup has to be painted
 * over the whole page while the card that opens it sits inside `#column-center`
 * — a transformed box in the empty state, which would become the containing
 * block of a `position: fixed` descendant. The host is rendered by App in
 * `KMainScreen`'s overlay slot instead, outside that box.
 *
 * `open` is kept for a moment after closing so the 150 ms tweb fade/slide-back
 * can play before the popup unmounts; opening again during that window simply
 * retargets the same popup.
 */
export interface StickerPopupState {
  /** The set to preview; null when no popup has ever been opened. */
  set: StickerSetInfo | null;
  open: boolean;
}

type State = StickerPopupState & { seq: number };

const CLOSE_ANIMATION_MS = 250;

let state: State = { set: null, open: false, seq: 0 };
let closeTimer = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: Omit<State, "seq">) {
  state = { ...next, seq: state.seq + 1 };
  emit();
}

/** Opens (or retargets) the sticker-set preview popup for one set. */
export function openStickerPopup(set: StickerSetInfo) {
  window.clearTimeout(closeTimer);
  closeTimer = 0;
  setState({ set, open: true });
}

/** Starts the close animation; clears the set once it has finished. */
export function closeStickerPopup() {
  if (!state.set || !state.open) return;
  window.clearTimeout(closeTimer);
  setState({ set: state.set, open: false });
  closeTimer = window.setTimeout(() => {
    closeTimer = 0;
    if (!state.open) {
      setState({ set: null, open: false });
    }
  }, CLOSE_ANIMATION_MS);
}

export function useStickerPopup(): StickerPopupState {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
  return { set: snapshot.set, open: snapshot.open };
}
