/** Saved GIFs for the GIF tab. */
import {
  loadSavedGifs,
  peekSavedGifs,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { SavedGif } from "../../../types";
import { usePickerResource, type PickerResource } from "./usePickerResource";

export function useSavedGifs(
  network: PickerNetwork | undefined,
  enabled: boolean,
): PickerResource<SavedGif[]> {
  return usePickerResource<SavedGif[]>({
    network,
    enabled,
    cacheKey: "saved-gifs",
    peek: peekSavedGifs,
    load: (activeNetwork, force) => loadSavedGifs(activeNetwork, { force }),
    reloadScopes: ["gifs"],
  });
}
