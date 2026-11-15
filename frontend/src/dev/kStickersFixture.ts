import type { StickerDoc, StickerSetInfo } from "../types";
import type { KStickersPreviewData } from "../components/k/KStickersPage";

/**
 * Offline fixture for `k-preview.html?page=stickers`: the trending browser's
 * layout is kernel-driven, and the harness has no kernel. The placeholder art is
 * a data-URL circle with the sticker's index, so only the page geometry,
 * typography, pills and scrolling are exercised — not the sticker artwork.
 */

const COLORS = [
  "#e8b53a",
  "#cf3f5a",
  "#b9603f",
  "#5eb33c",
  "#e08c4f",
  "#4aa3c7",
  "#8b6cc9",
  "#d46a9a",
];

function art(label: string, background: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="136" height="136" viewBox="0 0 136 136">` +
    `<circle cx="68" cy="68" r="56" fill="${background}"/>` +
    `<text x="68" y="80" font-family="Arial, sans-serif" font-size="30" font-weight="bold" text-anchor="middle" fill="#ffffff">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SETS: Array<[title: string, count: number, installed: boolean]> = [
  ["Duck", 40, false],
  ["Hot Cherry", 34, true],
  ["Buddy Bear", 28, false],
  ["Croco", 34, false],
  ["Life's a Peach", 23, false],
  ["Chilled Cat", 24, false],
  ["Cubigator", 30, false],
  ["Green Lizard", 28, false],
  ["Donut", 31, false],
  ["Orangoutang", 27, false],
  ["Feisty Fox", 19, false],
  ["Winter Wolf", 26, false],
];

export function createStickersPageFixture(): KStickersPreviewData {
  const docs: Record<string, StickerDoc[]> = {};
  const sets: StickerSetInfo[] = SETS.map(([title, count, installed], index) => {
    const ref = `sset_fixture_${index}`;
    docs[ref] = Array.from({ length: Math.min(5, count) }, (_, i) => {
      const image = art(String(i + 1), COLORS[(index + i) % COLORS.length]);
      return {
        ref: `sdoc_fixture_${index}_${i}`,
        id: String(50000 + index * 10 + i),
        kind: "static" as const,
        emoji: "🦆",
        thumbUrl: image,
        photoUrl: image,
        w: 512,
        h: 512,
      };
    });
    return {
      ref,
      id: String(1000 + index),
      title,
      count,
      installed,
    };
  });
  return {
    sets,
    docs,
    installed: new Set(sets.filter((set) => set.installed).map((set) => set.id)),
  };
}
