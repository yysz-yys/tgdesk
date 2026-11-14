/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node temp/emoji-r3/build-emoji-data.mjs (dev-only; temp/ is gitignored).
 *
 * This catalogue is the exact Telegram Web K emoji tab: tile order, skin-tone
 * templates and the Apple emoji image set match web.telegram.org (Web K).
 *
 * Sources:
 *  - Telegram Web K (GPL-3.0-only) `src/config/emoji.ts` / `emojiSkinTone.ts`:
 *    tile order and skin-tone templates, used as the parity reference.
 *    https://github.com/morethanwords/tweb
 *  - iamcal/emoji-data `emoji_pretty.json` (MIT, © 2013 Cal Henderson):
 *    fully-qualified Unicode strings and English short names.
 *    https://github.com/iamcal/emoji-data
 *  - Unicode CLDR annotations / annotationsDerived (Unicode License V3):
 *    localized en/zh/ja search keywords carried over from the previous
 *    catalogue by codepoint key. https://github.com/unicode-org/cldr-json
 *  - Apple emoji artwork: the 64 px PNGs from iamcal/emoji-data's Apple set,
 *    the same images Web K ships under `public/assets/img/emoji`. See
 *    THIRD_PARTY_NOTICES.md for the licensing note.
 *
 * The emoji tiles are drawn as images: every catalogue emoji (and each of its
 * skin-tone variants) resolves to `/emoji/<imageKey>.png`, where the key is the
 * Web K "unified" identifier with `-fe0f` stripped.
 */

/**
 * Lazy per-language keyword tables.
 *
 * The main `emoji` module is bundled with the picker, but the keyword tables
 * are ~150–180 KB raw each, so they are split into separate chunks and fetched
 * only when the emoji picker is opened for that UI language (the promise is
 * cached, so reopening the picker never reloads a table).
 */
export type EmojiKeywordTable = readonly (readonly string[])[];

export type EmojiKeywordLanguage = "en" | "zh" | "ja";

const LOADERS: Record<EmojiKeywordLanguage, () => Promise<{ default: EmojiKeywordTable }>> = {
  en: () => import("./emojiKeywords.en"),
  zh: () => import("./emojiKeywords.zh"),
  ja: () => import("./emojiKeywords.ja"),
};

const cache = new Map<EmojiKeywordLanguage, Promise<EmojiKeywordTable>>();

/** Maps i18next language tags ("zh-CN", "ja-JP", …) to a bundled keyword table. */
export function resolveEmojiKeywordLanguage(language: string | undefined): EmojiKeywordLanguage {
  const tag = (language ?? "en").toLowerCase();
  if (tag.startsWith("zh")) return "zh";
  if (tag.startsWith("ja")) return "ja";
  if (tag.startsWith("en")) return "en";
  return "en";
}

/** Load (and cache) the keyword table for a language; falls back to English. */
export function loadEmojiKeywords(language: string | undefined): Promise<EmojiKeywordTable> {
  const resolved = resolveEmojiKeywordLanguage(language);
  const cached = cache.get(resolved);
  if (cached) return cached;
  const promise = LOADERS[resolved]().then(
    (module) => module.default,
    (error: unknown) => {
      cache.delete(resolved);
      if (resolved !== "en") {
        return loadEmojiKeywords("en");
      }
      throw error;
    },
  );
  cache.set(resolved, promise);
  return promise;
}
