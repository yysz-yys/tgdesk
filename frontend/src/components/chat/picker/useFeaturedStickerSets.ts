/**
 * Telegram's featured / trending sticker sets for the picker's Trending section.
 * The kernel does not cache this showcase read, so the module cache keeps it for
 * five minutes (see loadFeaturedStickerSets).
 */
import {
  loadFeaturedStickerSets,
  peekFeaturedStickerSets,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { StickerSetInfo } from "../../../types";
import { usePickerResource, type PickerResource } from "./usePickerResource";

export function useFeaturedStickerSets(
  network: PickerNetwork | undefined,
  enabled: boolean,
): PickerResource<StickerSetInfo[]> {
  return usePickerResource<StickerSetInfo[]>({
    network,
    enabled,
    cacheKey: "featured-sticker-sets",
    peek: peekFeaturedStickerSets,
    load: (activeNetwork, force) =>
      loadFeaturedStickerSets(activeNetwork, { force }),
    reloadScopes: ["featured", "packs"],
  });
}
