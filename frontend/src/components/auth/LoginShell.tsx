import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import type { ThemePreference } from "../../hooks/useTheme";
import { Icon } from "../ui/Icon";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { BrandMark } from "./BrandMark";

export type LoginLanguage = AppSettings["language"];

const LANGUAGE_NAMES: Record<"en" | "zh" | "ja", string> = {
  en: "English",
  zh: "简体中文",
  ja: "日本語",
};

const THEME_ICONS: Record<ThemePreference, string> = {
  system: "routine",
  light: "light_mode",
  dark: "dark_mode",
};

interface LoginShellProps {
  children: ReactNode;
  language: LoginLanguage;
  onLanguageChange: (language: LoginLanguage) => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

/**
 * Minimal sign-in surface: one brand lockup, one card, one footer. The language
 * and theme menus are the only chrome outside the card. Both offer "follow
 * system" and persist through AppSettings.
 */
export function LoginShell({
  children,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
}: LoginShellProps) {
  const { t, i18n } = useTranslation();
  const resolved = (i18n.resolvedLanguage ?? "en") as keyof typeof LANGUAGE_NAMES;
  const currentName = LANGUAGE_NAMES[resolved] ?? LANGUAGE_NAMES.en;
  const languageLabel =
    language === "system"
      ? `${t("common.systemDefault")} · ${currentName}`
      : currentName;
  const themeLabel = t(`settings.appearance.${theme}`);

  return (
    <div className="g-login">
      <main className="g-login-main">
        <div className="g-login-brand">
          <BrandMark size={36} alt="" />
          <span className="g-login-wordmark">tgdesk</span>
        </div>

        <section className="g-login-card" aria-label={t("login.title")}>
          {children}
        </section>

        <div className="g-login-footer">
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="g-login-language"
                aria-label={`${t("login.language")}: ${languageLabel}`}
              >
                <Icon name="language" size={16} />
                <span>{languageLabel}</span>
                <Icon name="expand_more" size={15} />
              </button>
            </MenuTrigger>
            <MenuContent align="start" side="top">
              <MenuLabel>{t("login.language")}</MenuLabel>
              <MenuItem
                selected={language === "system"}
                onSelect={() => onLanguageChange("system")}
              >
                {t("common.systemDefault")}
              </MenuItem>
              <MenuSeparator />
              {(["en", "zh", "ja"] as const).map((code) => (
                <MenuItem
                  key={code}
                  selected={language === code}
                  onSelect={() => onLanguageChange(code)}
                >
                  {LANGUAGE_NAMES[code]}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <span className="g-login-footer-dot" />

          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="g-login-theme"
                aria-label={`${t("settings.appearance.theme")}: ${themeLabel}`}
                title={themeLabel}
              >
                <Icon name={THEME_ICONS[theme]} size={17} />
              </button>
            </MenuTrigger>
            <MenuContent align="start" side="top">
              <MenuLabel>{t("settings.appearance.theme")}</MenuLabel>
              {(["system", "light", "dark"] as const).map((value) => (
                <MenuItem
                  key={value}
                  icon={<Icon name={THEME_ICONS[value]} size={18} />}
                  selected={theme === value}
                  onSelect={() => onThemeChange(value)}
                >
                  {t(`settings.appearance.${value}`)}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>

          <span className="g-login-footer-dot" />
          <span>{t("login.footerReal")}</span>
        </div>
      </main>
    </div>
  );
}
