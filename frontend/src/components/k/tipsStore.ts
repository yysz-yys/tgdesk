import { useSyncExternalStore } from "react";

/**
 * Chat-tips deck state (tweb stores it in appSettings.chatTips: `hidden` and the
 * selected `index`, both persisted). It lives outside React because the deck
 * sits in the middle column while the lightbulb toggle has to be portalled to
 * the page (tweb does the same with a Portal — `#column-center` carries a
 * translateX that would otherwise become a fixed descendant's containing block).
 */
type TipsState = {
  hidden: boolean;
  index: number;
};

const HIDDEN_KEY = "tgdesk.k.chatTips.hidden.v2";
const INDEX_KEY = "tgdesk.k.chatTips.index.v2";
export const TIPS_COUNT = 3;

function readState(): TipsState {
  let hidden = false;
  let index = 0;
  try {
    // Collapsed until the user opens the deck — a first visit shows only the
    // "select a chat" pill on the wallpaper, exactly like telegram web.
    hidden = localStorage.getItem(HIDDEN_KEY) !== "0";
    const stored = Number(localStorage.getItem(INDEX_KEY));
    if (Number.isFinite(stored)) {
      index = Math.min(Math.max(0, stored), TIPS_COUNT - 1);
    }
  } catch {
    // Private mode/quota: fall back to the default (open, first tip).
  }
  return { hidden, index };
}

let state: TipsState = readState();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    localStorage.setItem(HIDDEN_KEY, state.hidden ? "1" : "0");
    localStorage.setItem(INDEX_KEY, String(state.index));
  } catch {
    // Only costs the next launch's default.
  }
}

export function useTipsState(): TipsState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

export function setTipsHidden(hidden: boolean) {
  if (state.hidden === hidden) return;
  state = { ...state, hidden };
  persist();
  emit();
}

export function toggleTips() {
  setTipsHidden(!state.hidden);
}

export function setTipsIndex(index: number) {
  const next = ((index % TIPS_COUNT) + TIPS_COUNT) % TIPS_COUNT;
  if (state.index === next) return;
  state = { ...state, index: next };
  persist();
  emit();
}
