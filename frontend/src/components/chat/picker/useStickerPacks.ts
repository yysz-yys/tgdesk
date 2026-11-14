/** Installed sticker packs + recent stickers for the stickers tab. */
import {
  loadStickerPacks,
  peekStickerPacks,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { StickerPacks } from "../../../types";
import { usePickerResource, type PickerResource } from "./usePickerResource";

export function useStickerPacks(
  network: PickerNetwork | undefined,
  enabled: boolean,
): PickerResource<StickerPacks> {
  return usePickerResource<StickerPacks>({
    network,
    enabled,
    cacheKey: "sticker-packs",
    peek: peekStickerPacks,
    load: (activeNetwork, force) => loadStickerPacks(activeNetwork, { force }),
    reloadScopes: ["packs", "recents"],
  });
}
