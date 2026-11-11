import { useEffect, useState } from "react";
import type { Accent } from "../types";

export interface AppSettings {
  language: "system" | "en" | "zh" | "ja";
  startWithWindows: boolean;
  closeToTray: boolean;
  notifications: boolean;
  downloadDir: string;
  concurrency: number;
  threads: number;
  template: string;
  skipSame: boolean;
  takeout: boolean;
  rewriteExt: boolean;
  proxyType: "none" | "socks5" | "http";
  proxyHost: string;
  proxyPort: string;
  proxyUser: string;
  proxyPass: string;
  ntp: string;
  logLevel: "info" | "debug";
  messageSize: number;
  chatPattern: boolean;
  accent: Accent;
}

export const defaultSettings: AppSettings = {
  language: "system",
  startWithWindows: false,
  closeToTray: true,
  notifications: true,
  downloadDir: "",
  concurrency: 2,
  threads: 4,
  template: "{{ .DialogID }}_{{ .MessageID }}_{{ filenamify .FileName }}",
  skipSame: true,
  takeout: false,
  rewriteExt: false,
  proxyType: "none",
  proxyHost: "127.0.0.1",
  proxyPort: "1080",
  proxyUser: "",
  proxyPass: "",
  ntp: "",
  logLevel: "info",
  messageSize: 14,
  chatPattern: true,
  accent: "blue",
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

  const reset = () => setSettings(defaultSettings);

  return { settings, update, reset };
}
