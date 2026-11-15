/**
 * The Appearance tiles' figures, bundled with the app.
 *
 * Telegram draws each tile's figure (the factory house, the chick, snowman,
 * diamond, …) as an animated emoji — an `application/x-tgsticker` Lottie file
 * from the account's animated-emoji set. Downloading those on first launch took
 * seconds, so the figures the strip needs are shipped as the same TGS files
 * (gzipped Lottie JSON, ~276 KB for all nine) in `public/assets/tgs/themes`:
 * the tiles have their artwork and click animation immediately, without a
 * network round-trip. The kernel's animated-emoji endpoint remains the source
 * for any emoticon this table does not know yet (e.g. a theme Telegram adds
 * later), so the strip is not frozen to this snapshot.
 */
const BUNDLED: Record<string, string> = {
  "🏠": "/assets/tgs/themes/house.tgs",
  "🐥": "/assets/tgs/themes/chick.tgs",
  "⛄": "/assets/tgs/themes/snowman.tgs",
  "💎": "/assets/tgs/themes/diamond.tgs",
  "👨‍🏫": "/assets/tgs/themes/teacher.tgs",
  "🌷": "/assets/tgs/themes/tulip.tgs",
  "💜": "/assets/tgs/themes/purple-heart.tgs",
  "🎄": "/assets/tgs/themes/tree.tgs",
  "🎮": "/assets/tgs/themes/gamepad.tgs",
};

/** The bundled TGS URL for a theme emoticon, or undefined when not shipped. */
export function bundledThemeEmoji(emoticon: string | undefined): string | undefined {
  if (!emoticon) return undefined;
  return BUNDLED[emoticon.trim()];
}
