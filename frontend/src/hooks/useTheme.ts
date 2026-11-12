import { useEffect } from "react";

export type ThemePreference = "system" | "light" | "dark";

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Applies the stored theme preference to the document. `system` follows the
 * Windows colour scheme live; explicit light/dark choices win until changed.
 */
export function useTheme(preference: ThemePreference) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const resolved = resolveTheme(preference);
      const root = document.documentElement;
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", resolved === "dark" ? "#131314" : "#f8fafd");
    };

    apply();
    if (preference === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
    return undefined;
  }, [preference]);
}
