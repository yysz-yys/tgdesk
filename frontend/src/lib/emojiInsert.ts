/**
 * Emoji insertion helpers for the composer textarea.
 *
 * Telegram Web inserts an emoji at the caret without losing the selection or the
 * focus. React controlled textareas need the new value plus the caret position
 * back, so the insert helpers return both and leave focus on the field.
 *
 * The picker steals focus while it is open, so the composer usually saves the
 * range before opening it (`getCaretRange`) and inserts through
 * `insertEmojiAtRange`; `insertEmojiAtCursor` is the shortcut for when the
 * textarea still owns the selection.
 */
export interface EmojiInsertResult {
  /** The textarea value after inserting the emoji. */
  value: string;
  /** Caret offset immediately after the inserted emoji. */
  caret: number;
}

/** A selection range inside the textarea value (UTF-16 offsets). */
export interface EmojiCaretRange {
  start: number;
  end: number;
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) {
    return length;
  }
  return Math.max(0, Math.min(length, offset));
}

/** The textarea's current selection, clamped to its value. */
export function getCaretRange(element: HTMLTextAreaElement): EmojiCaretRange {
  const length = element.value.length;
  const start = clampOffset(element.selectionStart ?? length, length);
  const end = clampOffset(element.selectionEnd ?? start, length);
  return start <= end ? { start, end } : { start: end, end: start };
}

/** Inserts `emoji` into a previously saved range (replacing the selection). */
export function insertEmojiAtRange(
  element: HTMLTextAreaElement,
  emoji: string,
  range: EmojiCaretRange,
): EmojiInsertResult {
  const length = element.value.length;
  const start = clampOffset(range.start, length);
  const end = Math.max(start, clampOffset(range.end, length));
  const value = `${element.value.slice(0, start)}${emoji}${element.value.slice(end)}`;
  const caret = start + emoji.length;
  // Write the DOM value now so an immediate send (Enter right after a click)
  // reads the new text even before React re-renders.
  element.value = value;
  try {
    element.setSelectionRange(caret, caret);
  } catch {
    // Disabled/readonly fields cannot hold a selection; the caller owns state.
  }
  return { value, caret };
}

/** Inserts `emoji` at the current caret (or replaces the selected range). */
export function insertEmojiAtCursor(
  element: HTMLTextAreaElement,
  emoji: string,
): EmojiInsertResult {
  return insertEmojiAtRange(element, emoji, getCaretRange(element));
}

/** Restores the caret after React has applied a controlled value update. */
export function restoreCaret(element: HTMLTextAreaElement | null, caret: number) {
  if (!element) {
    return;
  }
  requestAnimationFrame(() => {
    try {
      element.focus();
      element.setSelectionRange(caret, caret);
    } catch {
      // The field was unmounted while the frame was queued.
    }
  });
}
