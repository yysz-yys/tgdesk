/**
 * Inline-bot GIF search (`contacts.resolveUsername("gif")` + inline results on
 * the kernel side), paged with the bot's `next_offset`.
 *
 * Telegram Web K debounces the query by 400 ms and appends further pages as the
 * masonry grid scrolls. Every page carries the query id + opaque result refs the
 * send path (`SendInlineGif`) needs; a new query invalidates the old pages.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  searchGifPage,
  type PickerNetwork,
} from "../../../lib/stickerApi";
import type { SavedGif } from "../../../types";
import { useDebouncedValue } from "./useDebouncedValue";

export const GIF_SEARCH_DEBOUNCE_MS = 400;

export interface GifSearchResource {
  /** Query the current page belongs to ("" when no search is running). */
  query: string;
  gifs: SavedGif[];
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  /** Inline-bot query id for the loaded page (0 before the first page). */
  queryId: number;
  hasMore: boolean;
  reload: () => void;
  loadMore: () => void;
}

interface GifSearchState {
  query: string;
  gifs: SavedGif[];
  queryId: number;
  nextOffset: string;
  error: unknown;
  loading: boolean;
  loadingMore: boolean;
}

const EMPTY_STATE: GifSearchState = {
  query: "",
  gifs: [],
  queryId: 0,
  nextOffset: "",
  error: null,
  loading: false,
  loadingMore: false,
};

function gifIdentity(gif: SavedGif): string {
  return gif.id || gif.ref;
}

/** Appends a page while dropping results the bot repeated across pages. */
function appendPage(current: readonly SavedGif[], page: readonly SavedGif[]): SavedGif[] {
  const seen = new Set(current.map(gifIdentity));
  const next = [...current];
  for (const gif of page) {
    const identity = gifIdentity(gif);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    next.push(gif);
  }
  return next;
}

export function useGifSearch(
  network: PickerNetwork | undefined,
  query: string,
  enabled: boolean,
): GifSearchResource {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, GIF_SEARCH_DEBOUNCE_MS);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GifSearchState>(EMPTY_STATE);
  const requestRef = useRef(0);
  const networkRef = useRef(network);
  networkRef.current = network;
  const stateRef = useRef(state);
  stateRef.current = state;
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
    setState({ ...EMPTY_STATE, query: debounced, loading: true });
    let cancelled = false;
    searchGifPage(activeNetwork, debounced, "").then(
      (page) => {
        if (cancelled || requestRef.current !== request) {
          return;
        }
        setState({
          query: debounced,
          gifs: page.gifs,
          queryId: page.queryId,
          nextOffset: page.nextOffset,
          error: null,
          loading: false,
          loadingMore: false,
        });
      },
      (error: unknown) => {
        if (cancelled || requestRef.current !== request) {
          return;
        }
        setState({ ...EMPTY_STATE, query: debounced, error, loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, debounced, enabled, networkKey]);

  const loadMore = useCallback(() => {
    const activeNetwork = networkRef.current;
    const current = stateRef.current;
    if (
      !activeNetwork ||
      !current.nextOffset ||
      current.loading ||
      current.loadingMore
    ) {
      return;
    }
    const request = requestRef.current;
    const query = current.query;
    setState((previous) => ({ ...previous, loadingMore: true, error: null }));
    searchGifPage(activeNetwork, query, current.nextOffset).then(
      (page) => {
        if (requestRef.current !== request) {
          return;
        }
        setState((previous) => {
          if (previous.query !== query) {
            return previous;
          }
          return {
            ...previous,
            gifs: appendPage(previous.gifs, page.gifs),
            queryId: page.queryId || previous.queryId,
            nextOffset: page.nextOffset,
            loadingMore: false,
            error: null,
          };
        });
      },
      (error: unknown) => {
        if (requestRef.current !== request) {
          return;
        }
        setState((previous) => ({ ...previous, loadingMore: false, error }));
      },
    );
  }, []);

  const current = state.query === debounced ? state : EMPTY_STATE;
  const typing = trimmed.length > 0 && trimmed !== debounced;
  const loading = trimmed.length > 0 && (typing || current.loading);

  return {
    query: current.query,
    gifs: current.gifs,
    loading,
    loadingMore: current.loadingMore,
    error: current.error,
    queryId: current.queryId,
    hasMore: current.nextOffset.length > 0,
    reload,
    loadMore,
  };
}
