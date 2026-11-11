import { useEffect, useState } from "react";
import type { ResolvedTheme, Theme } from "../types";

const STORAGE_KEY = "tgdesk.theme";

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialPreference(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function useTheme() {
  const [preference, setPreference] = useState<Theme>(initialPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme = preference === "system" ? system : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference, resolvedTheme]);

  return {
    preference,
    resolvedTheme,
    setPreference,
    toggleTheme: () =>
      setPreference((current) => {
        const currentResolved = current === "system" ? system : current;
        return currentResolved === "dark" ? "light" : "dark";
      }),
  };
}
