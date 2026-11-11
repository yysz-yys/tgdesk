import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import ja from "./locales/ja";
import zh from "./locales/zh";

export type AppLanguage = "en" | "zh" | "ja";

function matchLanguage(value: string | undefined): AppLanguage | null {
  if (!value) {
    return null;
  }
  const tag = value.toLowerCase();
  if (tag.startsWith("zh")) {
    return "zh";
  }
  if (tag.startsWith("ja")) {
    return "ja";
  }
  if (tag.startsWith("en")) {
    return "en";
  }
  return null;
}

export function detectSystemLanguage(): AppLanguage {
  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language ?? "en"];

  for (const language of languages) {
    const match = matchLanguage(language);
    if (match) {
      return match;
    }
  }

  return "en";
}

export function resolveLanguage(preference: string | undefined): AppLanguage {
  return matchLanguage(preference) ?? detectSystemLanguage();
}

function storedLanguagePreference(): string | undefined {
  try {
    const raw = localStorage.getItem("tgdesk.settings");
    if (!raw) {
      return undefined;
    }
    return (JSON.parse(raw) as { language?: string }).language;
  } catch {
    return undefined;
  }
}

const initialLanguage = resolveLanguage(storedLanguagePreference());
document.documentElement.lang = initialLanguage === "zh" ? "zh-CN" : initialLanguage;

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    ja: { translation: ja },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  supportedLngs: ["en", "zh", "ja"],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
