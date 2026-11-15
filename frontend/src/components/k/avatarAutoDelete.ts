/**
 * Web K's auto-delete (TTL) badge for chat-list avatars: a small circle in the
 * bottom-right corner showing the remaining period as a number over a unit
 * glyph ("1D", "2D", ...), exactly like tweb's `createAutoDeleteIcon`
 * (`components/autoDeleteIcon.ts`) over `avatar-auto-delete-timer`.
 *
 * The period is matched against the same option list tweb uses (1–8 hours,
 * 1–6 days, 1–3 weeks, 1–6 months, 1 year) with its 10% tolerance; anything
 * else falls back to the clock glyph.
 */
import type { KIconName } from "./icons";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 31 * DAY;
const YEAR = 365 * DAY;

type DurationUnit = "hours" | "days" | "weeks" | "months" | "years";

interface AutoDeleteOption {
  value: number;
  duration: number;
  unit: DurationUnit;
}

/** tweb `allTimeOptionsForAutoDeleteIcon` (order matters: first close match wins). */
const OPTIONS: AutoDeleteOption[] = [
  { value: HOUR, duration: 1, unit: "hours" },
  { value: HOUR * 2, duration: 2, unit: "hours" },
  { value: HOUR * 3, duration: 3, unit: "hours" },
  { value: HOUR * 4, duration: 4, unit: "hours" },
  { value: HOUR * 5, duration: 5, unit: "hours" },
  { value: HOUR * 6, duration: 6, unit: "hours" },
  { value: HOUR * 7, duration: 7, unit: "hours" },
  { value: HOUR * 8, duration: 8, unit: "hours" },
  { value: DAY, duration: 1, unit: "days" },
  { value: DAY * 2, duration: 2, unit: "days" },
  { value: DAY * 3, duration: 3, unit: "days" },
  { value: DAY * 4, duration: 4, unit: "days" },
  { value: DAY * 5, duration: 5, unit: "days" },
  { value: DAY * 6, duration: 6, unit: "days" },
  { value: WEEK, duration: 1, unit: "weeks" },
  { value: WEEK * 2, duration: 2, unit: "weeks" },
  { value: WEEK * 3, duration: 3, unit: "weeks" },
  { value: MONTH, duration: 1, unit: "months" },
  { value: MONTH * 2, duration: 2, unit: "months" },
  { value: MONTH * 3, duration: 3, unit: "months" },
  { value: MONTH * 4, duration: 4, unit: "months" },
  { value: MONTH * 5, duration: 5, unit: "months" },
  { value: MONTH * 6, duration: 6, unit: "months" },
  { value: YEAR, duration: 1, unit: "years" },
];

/** tweb `shiftedIcons`: Days && Years glyphs sit 1px to the inline end. */
const SHIFTED_UNITS: ReadonlySet<DurationUnit> = new Set(["days", "years"]);

export interface AutoDeleteBadge {
  numberIcon?: KIconName;
  unitIcon?: KIconName;
  shifted: boolean;
}

const NUMBER_ICONS: Partial<Record<number, KIconName>> = {
  1: "auto_delete_circle_1",
  2: "auto_delete_circle_2",
  3: "auto_delete_circle_3",
  4: "auto_delete_circle_4",
  5: "auto_delete_circle_5",
  6: "auto_delete_circle_6",
  7: "auto_delete_circle_7",
  8: "auto_delete_circle_8",
};

const UNIT_ICONS: Record<DurationUnit, KIconName> = {
  hours: "auto_delete_circle_hours",
  days: "auto_delete_circle_days",
  weeks: "auto_delete_circle_weeks",
  months: "auto_delete_circle_months",
  years: "auto_delete_circle_years",
};

function findOption(period: number) {
  for (const option of OPTIONS) {
    if (Math.abs(period - option.value) / option.value < 0.1) {
      return option;
    }
  }
  return null;
}

/**
 * The badge glyphs for a chat's TTL period (seconds), or null when the chat has
 * no auto-delete timer. Unknown periods get the clock glyph, like tweb.
 */
export function autoDeleteBadge(ttl?: number): AutoDeleteBadge | null {
  if (!ttl || ttl <= 0) return null;
  const option = findOption(ttl);
  if (!option) {
    return { shifted: false };
  }
  const numberIcon = NUMBER_ICONS[option.duration];
  const unitIcon = UNIT_ICONS[option.unit];
  if (!numberIcon || !unitIcon) {
    return { shifted: false };
  }
  return {
    numberIcon,
    unitIcon,
    shifted: SHIFTED_UNITS.has(option.unit),
  };
}

/** The clock glyph's name, used when no configured period matches. */
export const AUTO_DELETE_CLOCK_ICON: KIconName = "auto_delete_circle_clock";
export const AUTO_DELETE_EMPTY_ICON: KIconName = "auto_delete_circle_empty";
