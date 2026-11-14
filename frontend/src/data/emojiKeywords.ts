/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node temp/emoji/build-emoji-ts.mjs (dev-only; temp/ is gitignored).
 *
 * Sources (both permissive, AGPL-compatible):
 *  - Emoji list, category order and names: iamcal/emoji-data `emoji_pretty.json`
 *    MIT License, Copyright (c) 2013 Cal Henderson
 *    https://github.com/iamcal/emoji-data
 *  - Search keywords: Unicode CLDR annotations / annotationsDerived (en, zh, ja)
 *    Unicode License V3 — https://www.unicode.org/license.txt
 *    https://github.com/unicode-org/cldr-json
 *
 * Snapshot: iamcal/emoji-data master snapshot 2026-11-14; Unicode CLDR annotations snapshot of the same date.
 * Filter: Unicode <= 15.1 (Windows Segoe UI Emoji coverage), ©/®/™ excluded.
 * Emoji glyphs are rendered with the platform colour emoji font; the repository
 * bundles no emoji image assets.
 */

/**
 * Lazy per-language keyword tables.
 *
 * The main `emoji` module is small enough to bundle, but the keyword tables are
 * ~100–145 KB raw each, so they are split into separate chunks and fetched only
 * when the emoji picker is opened for that UI language (the promise is cached,
 * so reopening the picker never reloads a table).
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
