/**
 * Emoji image and skin-tone helpers.
 *
 * Telegram Web K draws emoji with its own 64 px Apple emoji PNGs on Windows
 * instead of the system colour font, so the picker matches web.telegram.org
 * (and Telegram Desktop) rather than Segoe UI Emoji. The asset set lives in
 * `frontend/public/emoji` (copied from Web K's `public/assets/img/emoji`);
 * every file is named by the Web K "unified" identifier with `-fe0f` stripped:
 * `1f575-fe0f-200d-2640` → `1f575-200d-2640.png`.
 *
 * `EMOJI_IMAGE_KEYS` in `data/emoji.ts` stores the exact Web K identifier for
 * every catalogue emoji (never re-derived from the glyph); tone variants are
 * keyed by the same convention, verified at build time against the asset dir.
 */
import {
  EMOJI_ALL,
  EMOJI_IMAGE_KEYS,
  EMOJI_SKIN_TONES,
} from "../data/emoji";

/** Skin-tone modifiers in Web K order (index 0 = default, no modifier). */
export const EMOJI_TONE_MODIFIERS = [
  "\u{1F3FB}",
  "\u{1F3FC}",
  "\u{1F3FD}",
  "\u{1F3FE}",
  "\u{1F3FF}",
] as const;

/** 0 = default (no modifier), 1…5 = the five skin tones. */
export type EmojiSkinTone = 0 | 1 | 2 | 3 | 4 | 5;

/** Number of swatches in the tone picker (default + five tones). */
export const EMOJI_TONE_SWATCH_COUNT = EMOJI_TONE_MODIFIERS.length + 1;

/**
 * Normalizes an emoji to the Web K image identifier: every codepoint as
 * zero-padded hex (≥ 4 digits, as Web K's data does), `-fe0f` stripped.
 */
export function encodeEmojiKey(emoji: string): string {
  return [...emoji]
    .map((char) => (char.codePointAt(0) ?? 0).toString(16).padStart(4, "0"))
    .join("-")
    .replace(/-?fe0f/g, "");
}

/** `/emoji/<key>.png` URL for an emoji (base or skin-tone variant). */
export function emojiImageUrl(emoji: string): string {
  const key = IMAGE_KEY_BY_EMOJI.get(emoji) ?? encodeEmojiKey(emoji);
  return `/emoji/${key}.png`;
}

/** The base emoji's tone variants, `[default, 1f3fb … 1f3ff]`, or undefined. */
export function emojiSkinToneVariants(baseEmoji: string): readonly string[] | undefined {
  return EMOJI_SKIN_TONES[baseEmoji];
}

/** Whether the base emoji offers the skin-tone picker. */
export function hasEmojiSkinTones(baseEmoji: string): boolean {
  return EMOJI_SKIN_TONES[baseEmoji] !== undefined;
}

/** Applies tone `tone` to `baseEmoji`; falls back to the base emoji. */
export function emojiWithSkinTone(baseEmoji: string, tone: number): string {
  const variants = EMOJI_SKIN_TONES[baseEmoji];
  if (!variants) {
    return baseEmoji;
  }
  const index = Number.isInteger(tone) && tone >= 0 && tone < variants.length ? tone : 0;
  return variants[index];
}

/** Maps any skin-tone variant back to its base emoji (recents/search normalization). */
export function emojiSkinToneBase(emoji: string): string {
  return TONE_BASE_BY_EMOJI.get(emoji) ?? emoji;
}

/** The tone index of a skin-tone variant (0 for bases and unmapped emoji). */
export function emojiSkinToneOf(emoji: string): EmojiSkinTone {
  const variants = EMOJI_SKIN_TONES[emojiSkinToneBase(emoji)];
  if (!variants) {
    return 0;
  }
  const index = variants.indexOf(emoji);
  return (index > 0 ? index : 0) as EmojiSkinTone;
}

// ------------------------------------------------------------------- indexes

const IMAGE_KEY_BY_EMOJI = new Map<string, string>();
for (let index = 0; index < EMOJI_ALL.length; index += 1) {
  const key = EMOJI_IMAGE_KEYS[index];
  if (key) {
    IMAGE_KEY_BY_EMOJI.set(EMOJI_ALL[index], key);
  }
}

const TONE_BASE_BY_EMOJI = new Map<string, string>();
for (const [base, variants] of Object.entries(EMOJI_SKIN_TONES)) {
  for (let tone = 1; tone < variants.length; tone += 1) {
    const variant = variants[tone];
    TONE_BASE_BY_EMOJI.set(variant, base);
    // The variant image key is the Web K skin-variant identifier
    // (`1f575-1f3fb-200d-2640`); the build script checks each one against the
    // bundled asset set, so this derivation always resolves.
    IMAGE_KEY_BY_EMOJI.set(variant, encodeEmojiKey(variant));
  }
}
