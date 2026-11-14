/**
 * Shared async-resource hook for the picker tabs/sections.
 *
 * Wraps the module-level caches in `src/lib/stickerApi.ts`:
 *   - paints synchronously from the cache when one exists (instant tab switch),
 *   - loads once per resource identity (network + cache key),
 *   - refreshes when the cache store reports a forced invalidation (failed send)
 *     or when the caller calls `reload()` (error-state Retry button),
 *   - ignores responses that arrive after the tab switched/unmounted.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeStickerCache,
  type PickerNetwork,
} from "../../../lib/stickerApi";

export interface PickerResource<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

export interface PickerResourceOptions<T> {
  network: PickerNetwork | undefined;
  enabled: boolean;
  /** Stable identity of the requested resource (part of the cache key). */
  cacheKey: string;
  peek: (network: PickerNetwork) => T | undefined;
  load: (network: PickerNetwork, force: boolean) => Promise<T>;
}

interface ResourceState<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
}

export function usePickerResource<T>({
  network,
  enabled,
  cacheKey,
  peek,
  load,
}: PickerResourceOptions<T>): PickerResource<T> {
  const networkRef = useRef(network);
  networkRef.current = network;
  const peekRef = useRef(peek);
  peekRef.current = peek;
  const loadRef = useRef(load);
  loadRef.current = load;

  const [state, setState] = useState<ResourceState<T>>(() => ({
    data: enabled && network ? peek(network) : undefined,
    loading: false,
    error: null,
  }));
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  // Resource identity: account + cache key. Changing chats must not show the
  // previous account's stickers.
  const resourceKey = network
    ? `${network.proxy}\u0000${network.ntp}\u0000${cacheKey}`
    : `\u0000${cacheKey}`;

  useEffect(() => {
    const activeNetwork = networkRef.current;
    if (!enabled || !activeNetwork) {
      setState({ data: undefined, loading: false, error: null });
      return;
    }
    let cancelled = false;
    const cached = peekRef.current(activeNetwork);
    setState({
      data: cached,
      loading: cached === undefined,
      error: null,
    });
    loadRef.current(activeNetwork, attempt > 0).then(
      (data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            data: peekRef.current(activeNetwork),
            loading: false,
            error,
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, resourceKey, attempt]);

  // Optimistic updates (sent sticker/GIF promoted) and forced refreshes come
  // through the module store instead of polling.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    return subscribeStickerCache((change) => {
      const activeNetwork = networkRef.current;
      if (!activeNetwork) {
        return;
      }
      if (change.force) {
        setAttempt((value) => value + 1);
        return;
      }
      const cached = peekRef.current(activeNetwork);
      if (cached !== undefined) {
        setState((previous) =>
          previous.data === cached
            ? previous
            : { data: cached, loading: false, error: null },
        );
      }
    });
  }, [enabled]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    reload,
  };
}
