/** One sticker set's documents, fetched once when its section scrolls in. */
import {
  loadStickerSet,
  peekStickerSet,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { StickerSetDetail } from "../../../types";
import { usePickerResource, type PickerResource } from "./usePickerResource";

export function useStickerSet(
  network: PickerNetwork | undefined,
  ref: string | undefined,
  enabled: boolean,
): PickerResource<StickerSetDetail> {
  const setRef = ref ?? "";
  return usePickerResource<StickerSetDetail>({
    network,
    enabled: enabled && setRef.length > 0,
    cacheKey: `sticker-set:${setRef}`,
    peek: (activeNetwork) => peekStickerSet(activeNetwork, setRef),
    load: (activeNetwork, force) =>
      loadStickerSet(activeNetwork, setRef, { force }),
  });
}
