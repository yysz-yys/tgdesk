import { useEffect, useState } from "react";
import type { ThemePreference } from "./useTheme";

export interface AppSettings {
  language: "system" | "en" | "zh" | "ja";
  theme: ThemePreference;
  downloadDir: string;
  threads: number;
  template: string;
  proxyType: "none" | "socks5" | "http";
  proxyHost: string;
  proxyPort: string;
  proxyUser: string;
  proxyPass: string;
  ntp: string;
  enterToSend: boolean;
  tdlStreaming: boolean;
}

export const defaultSettings: AppSettings = {
  language: "system",
  theme: "system",
  downloadDir: "",
  threads: 4,
  template: "{{ .DialogID }}_{{ .MessageID }}_{{ filenamify .FileName }}",
  proxyType: "none",
  proxyHost: "127.0.0.1",
  proxyPort: "1080",
  proxyUser: "",
  proxyPass: "",
  ntp: "",
  enterToSend: true,
  tdlStreaming: false,
};

const STORAGE_KEY = "tgdesk.settings";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return defaultSettings;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    const persisted: Partial<AppSettings> = { ...settings };
    delete persisted.proxyPass;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }, [settings]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return { settings, update };
}
