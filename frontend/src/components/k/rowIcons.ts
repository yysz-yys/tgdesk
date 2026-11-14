/**
 * The coloured 30px tile behind a row's icon, ported from tweb
 * `helpers/rowIconBackground.ts`: every icon has a registered Material colour
 * (or a stable hash fallback), and the tile is that colour with a white
 * 14%-opacity gradient painted over it using plus-lighter.
 *
 * Figma draws a white 100% -> 0% alpha gradient at 14% fill opacity over the
 * base colour; the blend can clip individual RGB channels before the gradient
 * reaches its top edge, so those clipping points become extra CSS stops.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const ROW_ICON_COLORS = {
  blue: "#2196F3",
  green: "#4CAF50",
  grey: "#78909C",
  orange: "#FB8C00",
  pink: "#E91E63",
  purple: "#7E57C2",
  red: "#F44336",
} as const;

type RowIconColorName = keyof typeof ROW_ICON_COLORS;

/** tweb's ROW_ICON_COLOR_BY_NAME, limited to the icons the port uses. */
const ROW_ICON_COLOR_BY_NAME: Record<string, RowIconColorName> = {
  bell_filled: "red",
  data_filled: "green",
  devices_filled: "blue",
  faq_filled: "blue",
  gift_filled: "orange",
  key_filled: "grey",
  keyboard_filled: "orange",
  limit_folders_filled: "blue",
  message_filled: "green",
  phone_filled: "green",
  premium_badge: "purple",
  reactions_filled: "pink",
  speaker_filled: "green",
  general_filled: "grey",
  web_filled: "purple",
  business_filled: "green",
  group_filled: "green",
  newchannel_filled: "orange",
  newprivate_filled: "blue",
};

const ROW_ICON_COLOR_VALUES = Object.values(ROW_ICON_COLORS);

const OVERLAY_OPACITY = 0.14;

function hashIconName(icon: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < icon.length; index += 1) {
    hash ^= icon.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mixPlusLighter(base: Rgb, overlay: Rgb, opacity: number): Rgb {
  return {
    r: Math.min(255, Math.round(base.r + overlay.r * opacity)),
    g: Math.min(255, Math.round(base.g + overlay.g * opacity)),
    b: Math.min(255, Math.round(base.b + overlay.b * opacity)),
  };
}

function rgbaToHexa(color: Rgb): string {
  const part = (value: number) => value.toString(16).padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}ff`;
}

export function rowIconBackgroundColor(icon: string): string {
  const name = ROW_ICON_COLOR_BY_NAME[icon];
  return (
    (name ? ROW_ICON_COLORS[name] : undefined) ??
    ROW_ICON_COLOR_VALUES[hashIconName(icon) % ROW_ICON_COLOR_VALUES.length]
  );
}

/** The `linear-gradient(180deg, …)` tweb paints behind a row icon. */
export function rowIconBackground(icon: string): string {
  if (icon === "premium_badge") {
    return "linear-gradient(180deg, #b694f9, #6c61df)";
  }
  const backdrop = hexToRgb(rowIconBackgroundColor(icon));
  const white: Rgb = { r: 255, g: 255, b: 255 };
  const offsets = new Set<number>([0, 1]);
  for (const channel of ["r", "g", "b"] as const) {
    const maximumAddition = white[channel] * OVERLAY_OPACITY;
    const value = backdrop[channel];
    if (value + maximumAddition <= 255) continue;
    offsets.add(1 - (255 - value) / maximumAddition);
  }
  const stops = [...offsets]
    .sort((left, right) => left - right)
    .map((offset) => {
      const color = mixPlusLighter(
        backdrop,
        white,
        OVERLAY_OPACITY * (1 - offset),
      );
      return `${rgbaToHexa(color)} ${Number((offset * 100).toFixed(4))}%`;
    });
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}
