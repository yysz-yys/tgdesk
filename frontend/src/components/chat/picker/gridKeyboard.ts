/**
 * Roving keyboard navigation shared by the sticker and GIF grids.
 *
 * Telegram Web K moves focus with the arrow keys inside a grid (columns read
 * from the computed CSS), Home/End jump within the grid, and ArrowUp on the
 * first row escapes to the set rail. Cells are plain buttons; the owning
 * section keeps a roving tab index so the grid is one tab stop.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const PICKER_CELL_SELECTOR = "[data-picker-cell]";
export const PICKER_RAIL_SELECTOR = "[data-rail-id]";

function gridColumns(grid: HTMLElement): number {
  const template = getComputedStyle(grid).gridTemplateColumns;
  const columns = template.split(" ").filter(Boolean).length;
  return Math.max(1, columns);
}

/**
 * Handles Arrow/Home/End on a grid cell. `onEscapeToRail` runs when ArrowUp is
 * pressed on the first row (stickers tab only; omitted for the GIF grid).
 */
export function handlePickerGridKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  onEscapeToRail?: () => void,
): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const cell = target.closest<HTMLElement>(PICKER_CELL_SELECTOR);
  if (!cell) {
    return;
  }
  const grid = cell.parentElement;
  if (!grid) {
    return;
  }
  const cells = Array.from(
    grid.querySelectorAll<HTMLElement>(PICKER_CELL_SELECTOR),
  );
  const index = cells.indexOf(cell);
  if (index < 0) {
    return;
  }
  const columns = gridColumns(grid);
  const rtl = getComputedStyle(grid).direction === "rtl";
  let next: number | null = null;
  switch (event.key) {
    case "ArrowLeft":
      next = rtl ? index + 1 : index - 1;
      break;
    case "ArrowRight":
      next = rtl ? index - 1 : index + 1;
      break;
    case "ArrowUp":
      if (index < columns && onEscapeToRail) {
        event.preventDefault();
        onEscapeToRail();
        return;
      }
      next = index - columns;
      break;
    case "ArrowDown":
      next = index + columns;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = cells.length - 1;
      break;
    default:
      return;
  }
  if (next === null) {
    return;
  }
  const clamped = Math.max(0, Math.min(cells.length - 1, next));
  const nextCell = cells[clamped];
  if (!nextCell || clamped === index) {
    return;
  }
  event.preventDefault();
  nextCell.focus();
  nextCell.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Handles ArrowLeft/Right/Home/End in the horizontal set rail. */
export function handlePickerRailKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  onArrowDown?: () => void,
): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const railItem = target.closest<HTMLElement>(PICKER_RAIL_SELECTOR);
  const rail = railItem?.parentElement;
  if (!railItem || !rail) {
    return false;
  }
  const items = Array.from(
    rail.querySelectorAll<HTMLElement>(PICKER_RAIL_SELECTOR),
  );
  const index = items.indexOf(railItem);
  if (index < 0) {
    return false;
  }
  const rtl = getComputedStyle(rail).direction === "rtl";
  let next: number | null = null;
  switch (event.key) {
    case "ArrowLeft":
      next = rtl ? index + 1 : index - 1;
      break;
    case "ArrowRight":
      next = rtl ? index - 1 : index + 1;
      break;
    case "ArrowDown":
      if (onArrowDown) {
        event.preventDefault();
        onArrowDown();
        return true;
      }
      return false;
    case "Home":
      next = 0;
      break;
    case "End":
      next = items.length - 1;
      break;
    default:
      return false;
  }
  if (next === null) {
    return false;
  }
  const clamped = Math.max(0, Math.min(items.length - 1, next));
  const nextItem = items[clamped];
  if (!nextItem) {
    return false;
  }
  event.preventDefault();
  nextItem.focus();
  nextItem.scrollIntoView({ block: "nearest", inline: "center" });
  return true;
}
