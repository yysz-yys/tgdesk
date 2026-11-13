import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Applies the stored theme preference to the document and returns the resolved
 * appearance so the Radix theme root can follow it without a second listener.
 * `system` follows the Windows colour scheme live; explicit choices win.
 */
export function useTheme(preference: ThemePreference): "light" | "dark" {
  const [resolved, setResolved] = useState(() => resolveTheme(preference));

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const next = resolveTheme(preference);
      setResolved(next);
      const root = document.documentElement;
      root.dataset.theme = next;
      root.style.colorScheme = next;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", next === "dark" ? "#101012" : "#eceef3");
    };

    apply();
    if (preference === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
    return undefined;
  }, [preference]);

  return resolved;
}
