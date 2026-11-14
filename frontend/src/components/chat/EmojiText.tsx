/**
 * Inline Telegram-Web-style emoji rendering for message text.
 *
 * The picker bundles Web K's Apple emoji PNGs, so message bubbles use the same
 * images instead of the Windows system font (which draws flags as letter pairs
 * and has a different look). Unknown glyphs fall back to plain text.
 */
import { Fragment, type ReactNode } from "react";
import { EMOJI_ALL, EMOJI_SKIN_TONES } from "../../data/emoji";
import { emojiImageUrl } from "../../lib/emojiImage";

const EMOJI_SET = (() => {
  const set = new Set<string>();
  for (const emoji of EMOJI_ALL) {
    set.add(emoji);
  }
  for (const variants of Object.values(EMOJI_SKIN_TONES)) {
    for (const emoji of variants) {
      set.add(emoji);
    }
  }
  return set;
})();

interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}

const SegmenterConstructor = (
  Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: "grapheme" },
    ) => GraphemeSegmenter;
  }
).Segmenter;

const graphemeSegmenter = SegmenterConstructor
  ? new SegmenterConstructor(undefined, { granularity: "grapheme" })
  : null;

function graphemes(text: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(text);
  }
  const result: string[] = [];
  for (const item of graphemeSegmenter.segment(text)) {
    result.push(item.segment);
  }
  return result;
}

/** Splits plain text into strings and emoji <img> elements. */
export function emojiNodes(text: string): ReactNode[] {
  if (!text) {
    return [];
  }
  const nodes: ReactNode[] = [];
  let plain = "";
  const flush = () => {
    if (plain) {
      nodes.push(plain);
      plain = "";
    }
  };
  for (const grapheme of graphemes(text)) {
    if (EMOJI_SET.has(grapheme)) {
      flush();
      nodes.push(
        <img
          key={`emoji-${nodes.length}`}
          className="f-emoji-inline"
          src={emojiImageUrl(grapheme)}
          alt={grapheme}
          title={grapheme}
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={(event) => {
            // Keep the Unicode text when an image is missing from the bundle.
            const image = event.currentTarget;
            image.replaceWith(document.createTextNode(image.alt));
          }}
        />,
      );
    } else {
      plain += grapheme;
    }
  }
  flush();
  return nodes;
}

export function EmojiText({ text }: { text: string }) {
  return <Fragment>{emojiNodes(text)}</Fragment>;
}
