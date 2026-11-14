/**
 * Trailing-edge debounce for the picker's server-side searches. Keeps the input
 * responsive while only firing one kernel RPC per pause (Web K: 300 ms for
 * sticker search, 400 ms for the inline GIF bot).
 */
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) {
      return;
    }
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [debounced, delayMs, value]);

  return debounced;
}
