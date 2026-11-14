/** Favorite stickers for the stickers tab (`messages.getFavedStickers`). */
import {
  loadFavedStickers,
  peekFavedStickers,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { StickerDoc } from "../../../types";
import { usePickerResource, type PickerResource } from "./usePickerResource";

export function useFavedStickers(
  network: PickerNetwork | undefined,
  enabled: boolean,
): PickerResource<StickerDoc[]> {
  return usePickerResource<StickerDoc[]>({
    network,
    enabled,
    cacheKey: "faved-stickers",
    peek: peekFavedStickers,
    load: (activeNetwork, force) => loadFavedStickers(activeNetwork, { force }),
    reloadScopes: ["faved"],
  });
}
