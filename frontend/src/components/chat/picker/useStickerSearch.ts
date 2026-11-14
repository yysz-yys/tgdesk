/**
 * Server-side sticker search (`messages.searchStickers` via the kernel).
 *
 * Mirrors Telegram Web K: typing is debounced 300 ms, clearing the query returns
 * to the installed packs, and stale responses from an older query are discarded.
 * The last successful page stays visible while a retry is in flight.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  searchStickerResults,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { StickerSearch } from "../../../types";
import { useDebouncedValue } from "./useDebouncedValue";

export const STICKER_SEARCH_DEBOUNCE_MS = 300;

export interface StickerSearchResource {
  /** Query the current data belongs to ("" when no search is running). */
  query: string;
  data: StickerSearch | undefined;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

interface SearchState {
  query: string;
  data: StickerSearch | undefined;
  error: unknown;
  loading: boolean;
}

const EMPTY_STATE: SearchState = {
  query: "",
  data: undefined,
  error: null,
  loading: false,
};

export function useStickerSearch(
  network: PickerNetwork | undefined,
  query: string,
  enabled: boolean,
): StickerSearchResource {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, STICKER_SEARCH_DEBOUNCE_MS);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>(EMPTY_STATE);
  const requestRef = useRef(0);
  const networkRef = useRef(network);
  networkRef.current = network;
  const networkKey = network ? `${network.proxy}\u0000${network.ntp}` : "";

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const activeNetwork = networkRef.current;
    if (!enabled || !activeNetwork || !debounced) {
      requestRef.current += 1;
      setState(EMPTY_STATE);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setState((previous) => ({
      query: debounced,
      data: previous.query === debounced ? previous.data : undefined,
      error: null,
      loading: true,
    }));
    let cancelled = false;
    searchStickerResults(activeNetwork, debounced).then(
      (data) => {
        if (cancelled || requestRef.current !== request) {
          return;
        }
        setState({ query: debounced, data, error: null, loading: false });
      },
      (error: unknown) => {
        if (cancelled || requestRef.current !== request) {
          return;
        }
        setState({ query: debounced, data: undefined, error, loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, debounced, enabled, networkKey]);

  const current = state.query === debounced ? state : EMPTY_STATE;
  const typing = trimmed.length > 0 && trimmed !== debounced;
  const loading = trimmed.length > 0 && (typing || current.loading);

  return {
    query: current.query,
    data: current.data,
    loading,
    error: current.error,
    reload,
  };
}
